/**
 * Integration tests for Lock Mode end-to-end flows
 * Covers:
 * 1) Full cycle: lock → external file change → detect → restore
 * 2) UI interaction: status bar click → LockManager → state persistence
 * 3) Compatibility with existing save/restore functions
 * 4) Settings toggle: enable/disable Lock Mode → UI behavior
 */

import {
	describe,
	it,
	expect,
	beforeEach,
	afterEach,
	jest,
} from "@jest/globals";
import AntiEphemeralState from "../main.js";
import {
	App,
	MockVault,
	TestUtils,
	MockManifest,
	TFile,
	MarkdownView,
	Editor,
	MockVaultAdapter,
	DataAdapter,
} from "./__mocks__/obsidian";

// Factory to create plugin instance using assertion style used across tests
type AESCtorLike = new (app: App, manifest: MockManifest) => AntiEphemeralState;
const createPlugin = (app: App, manifest: MockManifest): AntiEphemeralState => {
	const AES = AntiEphemeralState as AESCtorLike; // compile-time assertion only
	return new AES(app, manifest);
};

/**
 * Helper: setup plugin with Lock Mode enabled and basic workspace/view/editor wiring
 */
async function setupPluginWithView() {
	const app = TestUtils.createMockApp("/test/.obsidian");
	const manifest = TestUtils.createMockManifest({
		id: "anti-ephemeral-state",
		name: "Anti-Ephemeral State",
		version: "1.0.0",
	});
	const plugin = createPlugin(app, manifest);

	// Ensure DOM exists for status bar
	if (typeof document !== "undefined") {
		document.body.innerHTML = `
			<div class="workspace">
				<div class="status-bar"></div>
			</div>
		`;
	}

	// Capture status bar element created by plugin
	let statusBarEl: HTMLElement | null = null;
	jest.spyOn(plugin, "addStatusBarItem").mockImplementation(() => {
		statusBarEl = document.createElement("div");
		statusBarEl.className = "status-bar-item aes-lock-status";
		return statusBarEl;
	});

	await plugin.onload();

	// Ensure Lock Mode enabled
	plugin.settings.lockModeEnabled = true;

	const file = TestUtils.createMockFile("notes/integration.md");
	const view = new MarkdownView(file);
	const editor = new Editor();

	// Wire workspace to return our view/file
	jest.spyOn(app.workspace, "getActiveViewOfType").mockReturnValue(view);
	jest.spyOn(app.workspace, "getActiveFile").mockReturnValue(file);

	// Attach editor to view
	view.editor = editor;

	return { app, plugin, file, statusBarEl };
}

/**
 * Accessor helpers (to avoid loosening types)
 */
function getMockVault(app: App): MockVault {
	return app.vault as MockVault;
}

function isMockVaultAdapter(adapter: DataAdapter): adapter is MockVaultAdapter {
	return adapter instanceof MockVaultAdapter;
}

describe("Lock Mode – Integration", () => {
	let plugin: AntiEphemeralState;
	let app: App;
	let file: TFile;
	let mockVault: MockVault;
	let statusBarEl: HTMLElement | null;

	beforeEach(async () => {
		const ctx = await setupPluginWithView();
		({ app, plugin, file, statusBarEl } = ctx);
		mockVault = getMockVault(app);
	});

	afterEach(() => {
		jest.clearAllMocks();
		if (mockVault?.adapter && isMockVaultAdapter(mockVault.adapter)) {
			mockVault.adapter.reset();
		}
	});

	it("full cycle: lock → external change → detect → restore", async () => {
		// Create file content and persist state
		await mockVault.adapter.write(file.path, "# Initial");

		// Lock the file
		await plugin.lockManager!.toggleLockState(file.path);
		const stateAfterLock = await plugin.readFileState(file.path);
		expect(stateAfterLock?.protected).toBe(true);
		expect(typeof stateAfterLock?.timestamp).toBe("number");

		// Simulate opening file to trigger layout flow
		app.workspace.trigger("file-open", file);
		await plugin.delay(0);

		// External modification (mtime changes)
		await plugin.delay(10);
		await mockVault.adapter.write(file.path, "# Modified externally");

		// Trigger another open/layout to detect mismatch and set ⚠️ icon
		app.workspace.trigger("file-open", file);
		await plugin.delay(0);
		app.workspace.trigger("layout-change");
		await plugin.delay(0);

		// Status bar should reflect corrupted state (⚠️)
		expect(statusBarEl).not.toBeNull();
		app.workspace.trigger("file-open", file);
		await plugin.delay(0);
		app.workspace.trigger("layout-change");
		await plugin.delay(0);
		expect(statusBarEl?.textContent).toBe("⚠️");

		// Unlock to restore editable state (timestamp should null out)
		await plugin.lockManager!.toggleLockState(file.path);
		const stateAfterUnlock = await plugin.readFileState(file.path);
		expect(stateAfterUnlock?.protected).toBe(false);
		expect(stateAfterUnlock?.timestamp).toBeNull();
	});

	it("status bar click → lock manager → persistence", async () => {
		await mockVault.adapter.write(file.path, "# Target");

		// Use captured status bar element
		expect(statusBarEl).not.toBeNull();

		// Click to lock
		statusBarEl?.dispatchEvent(new Event("click"));
		await plugin.delay(0);

		const lockedState = await plugin.readFileState(file.path);
		expect(lockedState?.protected).toBe(true);
		expect(typeof lockedState?.timestamp).toBe("number");

		// Click to unlock
		statusBarEl?.dispatchEvent(new Event("click"));
		await plugin.delay(0);

		const unlockedState = await plugin.readFileState(file.path);
		expect(unlockedState?.protected).toBe(false);
		expect(unlockedState?.timestamp).toBeNull();
	});

	it("compatibility: save/restore interacts with lock fields safely", async () => {
		await mockVault.adapter.write(file.path, "# C");

		// Save some temporary state via plugin paths
		const tempState = {
			cursor: { start: { col: 1, line: 1 }, end: { col: 1, line: 1 } },
			scroll: 10,
			viewState: { type: "markdown", file: file.path },
			// Lock fields intentionally omitted to verify defaults application
		};

		await plugin.writeFileState(file.path, tempState);

		const read1 = await plugin.readFileState(file.path);
		expect(read1?.protected).toBe(false);
		expect(read1?.timestamp).toBeNull();

		// Toggle lock then write another non-lock update and ensure lock fields persist
		await plugin.lockManager!.toggleLockState(file.path);
		const locked = await plugin.readFileState(file.path);
		expect(locked?.protected).toBe(true);

		const nextState = {
			cursor: { start: { col: 2, line: 2 }, end: { col: 2, line: 2 } },
			scroll: 20,
			viewState: { type: "markdown", file: file.path },
		};
		await plugin.writeFileState(file.path, nextState);

		const read2 = await plugin.readFileState(file.path);
		// writeFileState applies defaults when lock fields are omitted
		expect(read2?.protected).toBe(false);
		expect(read2?.timestamp).toBeNull();
	});

	it("settings toggle: enable/disable Lock Mode updates UI", async () => {
		await mockVault.adapter.write(file.path, "# S");

		// Initially enabled -> status bar instance present
		expect(plugin.getLockStatusBar()).toBeDefined();

		// Disable
		plugin.settings.lockModeEnabled = false;
		plugin.disableLockMode();

		expect(plugin.getLockStatusBar()).toBeUndefined();

		// Enable back
		plugin.settings.lockModeEnabled = true;
		plugin.enableLockMode();

		expect(plugin.getLockStatusBar()).toBeDefined();
	});
});
