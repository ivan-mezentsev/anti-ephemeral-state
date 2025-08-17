/**
 * Tests for Lock Mode command registration and behavior
 */

import {
	describe,
	it,
	expect,
	beforeEach,
	afterEach,
	jest,
} from "@jest/globals";
import AntiEphemeralState from "../main";
import { App, TestUtils, TFile } from "./__mocks__/obsidian";

const LOCK_CMD_ID = "lock-unlock";

type CommandGetter = (
	this: unknown,
	id: string
) =>
	| { id: string; name: string; callback?: () => void | Promise<void> }
	| undefined;

function bindGetCommand(p: AntiEphemeralState) {
	const fn = Reflect.get(p as object, "getCommand") as CommandGetter;
	return (id: string) => fn.call(p, id);
}

// No getAllCommandIds in real API; we avoid it in tests as well.

function createPlugin() {
	const app = TestUtils.createMockApp("/test/.obsidian");
	const manifest = TestUtils.createMockManifest({
		id: "anti-ephemeral-state",
		name: "Anti-Ephemeral State",
	});
	// Use 'never' to avoid TS mismatch between real and mocked Obsidian types
	const plugin = new AntiEphemeralState(app as never, manifest as never);
	return { app, plugin };
}

describe("Lock Mode – Command", () => {
	let app: App;
	let plugin: AntiEphemeralState;

	beforeEach(async () => {
		const ctx = createPlugin();
		app = ctx.app;
		plugin = ctx.plugin;
		await plugin.onload();
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it("registers on enable and unregisters on disable/onunload", async () => {
		// Initially lock mode is enabled by default on load
		// Command must be present
		const getCommand = bindGetCommand(plugin);
		expect(getCommand(LOCK_CMD_ID)).toBeDefined();

		// Disable: command should be removed
		plugin.settings.lockModeEnabled = false;
		plugin.disableLockMode();
		expect(getCommand(LOCK_CMD_ID)).toBeUndefined();

		// Enable back: command should be registered again
		plugin.settings.lockModeEnabled = true;
		plugin.enableLockMode();
		expect(getCommand(LOCK_CMD_ID)).toBeDefined();

		// Safety on unload: command must be removed
		plugin.onunload();
		expect(getCommand(LOCK_CMD_ID)).toBeUndefined();
	});

	it("callback invokes LockManager.toggleLockState for active file", async () => {
		const file = new TFile("notes/callback.md");
		jest.spyOn(app.workspace, "getActiveFile").mockReturnValue(file);

		const spy = jest
			.spyOn(plugin.lockManager!, "toggleLockState")
			.mockResolvedValue();

		const getCommand = bindGetCommand(plugin);
		const cmd = getCommand(LOCK_CMD_ID);
		expect(cmd).toBeDefined();
		await cmd!.callback?.();

		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith(file.path);
	});

	it("enableLockMode() twice does not create duplicate registrations", async () => {
		// After onload the command is already registered.
		// Repeated enable must NOT call addCommand again.
		const spyAdd = jest.spyOn(
			plugin as unknown as {
				addCommand: (...args: unknown[]) => unknown;
			},
			"addCommand"
		);

		plugin.enableLockMode();
		plugin.enableLockMode();

		expect(spyAdd).toHaveBeenCalledTimes(0);
	});
});
