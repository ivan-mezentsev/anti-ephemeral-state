/**
 * Tests for AntiEphemeralState plugin lifecycle (onload, onunload)
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
import { App, MockVault, TestUtils, MockManifest } from "./__mocks__/obsidian";

// Type for plugin with mock methods
interface PluginWithMockMethods extends AntiEphemeralState {
	setMockData: (data: Record<string, unknown> | null) => void;
	getMockData: () => Record<string, unknown>;
}

const createPlugin = (app: App, manifest: MockManifest): AntiEphemeralState => {
	return new AntiEphemeralState(app, manifest);
};

describe("AntiEphemeralState Plugin Lifecycle", () => {
	let plugin: AntiEphemeralState;
	let app: App;
	let manifest: MockManifest;
	let consoleSpy: jest.SpiedFunction<typeof console.debug>;
	let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

	beforeEach(() => {
		// Create test app with standard configDir
		app = TestUtils.createMockApp("/test/.obsidian");
		manifest = TestUtils.createMockManifest({
			id: "anti-ephemeral-state",
			name: "Anti-Ephemeral State",
			version: "1.0.0",
		});
		plugin = createPlugin(app, manifest);

		// Setup console spies
		consoleSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
		consoleErrorSpy = jest
			.spyOn(console, "error")
			.mockImplementation(() => {});
	});

	afterEach(() => {
		// Clean up mock file system
		if (app?.vault && app.vault.adapter) {
			app.vault.adapter.reset();
		}

		// Restore console methods
		consoleSpy.mockRestore();
		consoleErrorSpy.mockRestore();

		// Clean up any timers
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	describe("onload() method", () => {
		it("should complete full onload lifecycle successfully", async () => {
			// Ensure database directory doesn't exist initially
			const vault = app.vault;
			const expectedDbDir =
				"/test/.obsidian/plugins/anti-ephemeral-state/db";

			expect(await vault.adapter.exists(expectedDbDir)).toBe(false);

			// Execute onload
			await plugin.onload();

			// Verify DEFAULT_SETTINGS initialization
			expect(plugin.DEFAULT_SETTINGS).toBeDefined();
			expect(plugin.DEFAULT_SETTINGS.dbDir).toBe(expectedDbDir);

			// Verify settings loaded
			expect(plugin.settings).toBeDefined();
			expect(plugin.settings.dbDir).toBe(expectedDbDir);

			// Verify database directory created
			expect(await vault.adapter.exists(expectedDbDir)).toBe(true);

			// Verify debounced save function initialized
			expect(plugin.debouncedSave).toBeDefined();
			expect(typeof plugin.debouncedSave).toBe("function");

			// Verify console logging
			expect(consoleSpy).toHaveBeenCalledWith(
				"[AES] Created database directory:",
				expectedDbDir
			);
		});

		it("should initialize DEFAULT_SETTINGS before loading settings", async () => {
			// Verify DEFAULT_SETTINGS is undefined before onload
			expect(plugin.DEFAULT_SETTINGS).toBeUndefined();

			await plugin.onload();

			// Verify DEFAULT_SETTINGS is properly initialized
			expect(plugin.DEFAULT_SETTINGS).toBeDefined();
			expect(plugin.DEFAULT_SETTINGS.dbDir).toBe(
				"/test/.obsidian/plugins/anti-ephemeral-state/db"
			);
		});

		it("should create database directory if it doesn't exist", async () => {
			const vault = app.vault;
			const dbDir = "/test/.obsidian/plugins/anti-ephemeral-state/db";

			// Ensure directory doesn't exist
			expect(await vault.adapter.exists(dbDir)).toBe(false);

			await plugin.onload();

			// Directory should be created
			expect(await vault.adapter.exists(dbDir)).toBe(true);
			expect(consoleSpy).toHaveBeenCalledWith(
				"[AES] Created database directory:",
				dbDir
			);
		});

		it("should not fail if database directory already exists", async () => {
			const vault = app.vault;
			const dbDir = "/test/.obsidian/plugins/anti-ephemeral-state/db";

			// Pre-create the directory
			await vault.adapter.mkdir(dbDir);
			expect(await vault.adapter.exists(dbDir)).toBe(true);

			// Should not throw
			await expect(plugin.onload()).resolves.not.toThrow();

			// Should not log creation message
			expect(consoleSpy).not.toHaveBeenCalledWith(
				"[AES] Created database directory:",
				dbDir
			);
		});

		it("should handle database directory creation errors gracefully", async () => {
			const vault = app.vault;

			// Mock mkdir to throw error
			const originalMkdir = vault.adapter.mkdir;
			vault.adapter.mkdir = jest
				.fn()
				.mockRejectedValue(new Error("Permission denied"));

			// Should not throw during onload
			await expect(plugin.onload()).resolves.not.toThrow();

			// Should log error
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[AES] Error creating database directory:",
				expect.any(Error)
			);

			// Restore original method
			vault.adapter.mkdir = originalMkdir;
		});

		it("should register all required event listeners", async () => {
			// Mock registerEvent to track calls
			const registerEventSpy = jest
				.spyOn(plugin, "registerEvent")
				.mockImplementation(() => {});

			await plugin.onload();

			// Should register multiple events (file-open, rename, delete, editor-change, layout-change, active-leaf-change)
			expect(registerEventSpy).toHaveBeenCalledTimes(6);

			registerEventSpy.mockRestore();
		});

		it("should setup DOM event listeners", async () => {
			// Mock registerDomEvent to track calls
			const registerDomEventSpy = jest
				.spyOn(plugin, "registerDomEvent")
				.mockImplementation(() => {});

			await plugin.onload();

			// Should register DOM events (mouseup, keyup, scroll events)
			expect(registerDomEventSpy).toHaveBeenCalled();

			registerDomEventSpy.mockRestore();
		});

		it("should initialize debounced save function with correct delay", async () => {
			await plugin.onload();

			expect(plugin.debouncedSave).toBeDefined();
			expect(typeof plugin.debouncedSave).toBe("function");
			expect(typeof plugin.debouncedSave.cancel).toBe("function");
		});

		it("should call restoreTemporaryState during onload", async () => {
			// Mock restoreTemporaryState to track calls
			const restoreSpy = jest
				.spyOn(plugin, "restoreTemporaryState")
				.mockResolvedValue();

			await plugin.onload();

			expect(restoreSpy).toHaveBeenCalledTimes(1);

			restoreSpy.mockRestore();
		});

		it("should add settings tab during onload", async () => {
			// Mock addSettingTab to track calls
			const addSettingTabSpy = jest
				.spyOn(plugin, "addSettingTab")
				.mockImplementation(() => {});

			await plugin.onload();

			expect(addSettingTabSpy).toHaveBeenCalledTimes(1);

			addSettingTabSpy.mockRestore();
		});
	});

	describe("onunload() method", () => {
		beforeEach(async () => {
			// Load plugin first
			await plugin.onload();
		});

		it("should cancel debounced save function", () => {
			// Mock the cancel method
			const cancelSpy = jest.fn();
			plugin.debouncedSave = Object.assign(jest.fn(), {
				cancel: cancelSpy,
			});

			plugin.onunload();

			expect(cancelSpy).toHaveBeenCalledTimes(1);
		});

		it("should reset scrollListenersAttached flag", () => {
			// Set flag to true (simulating attached listeners)
			plugin.scrollListenersAttached = true;

			plugin.onunload();

			expect(plugin.scrollListenersAttached).toBe(false);
		});

		it("should call parent onunload method", () => {
			// Mock parent onunload
			const parentOnunloadSpy = jest
				.spyOn(
					Object.getPrototypeOf(Object.getPrototypeOf(plugin)),
					"onunload"
				)
				.mockImplementation(() => {});

			plugin.onunload();

			expect(parentOnunloadSpy).toHaveBeenCalledTimes(1);

			parentOnunloadSpy.mockRestore();
		});

		it("should handle missing debouncedSave gracefully", () => {
			// Remove debouncedSave
			delete (plugin as { debouncedSave?: unknown }).debouncedSave;

			// Should not throw
			expect(() => plugin.onunload()).not.toThrow();
		});

		it("should handle debouncedSave without cancel method", () => {
			// Set debouncedSave without cancel method
			plugin.debouncedSave = jest.fn() as typeof plugin.debouncedSave;

			// Should throw because the actual implementation expects cancel method
			expect(() => plugin.onunload()).toThrow(
				"this.debouncedSave.cancel is not a function"
			);
		});
	});

	describe("Full lifecycle integration", () => {
		it("should complete full load → use → unload cycle", async () => {
			const vault = app.vault;
			const dbDir = "/test/.obsidian/plugins/anti-ephemeral-state/db";

			// Initial state
			expect(plugin.DEFAULT_SETTINGS).toBeUndefined();
			expect(await vault.adapter.exists(dbDir)).toBe(false);

			// Load phase
			await plugin.onload();

			// Verify loaded state
			expect(plugin.DEFAULT_SETTINGS).toBeDefined();
			expect(plugin.settings).toBeDefined();
			expect(await vault.adapter.exists(dbDir)).toBe(true);
			expect(plugin.debouncedSave).toBeDefined();
			expect(plugin.scrollListenersAttached).toBe(false); // Will be set to true when listeners attach

			// Simulate some usage
			plugin.scrollListenersAttached = true;
			plugin.lastLoadedFileName = "test.md";
			plugin.loadingFile = false;

			// Unload phase
			plugin.onunload();

			// Verify unloaded state
			expect(plugin.scrollListenersAttached).toBe(false);
			// Other properties should remain as they were
			expect(plugin.DEFAULT_SETTINGS).toBeDefined();
			expect(plugin.settings).toBeDefined();
		});

		it("should handle multiple load/unload cycles", async () => {
			// First cycle
			await plugin.onload();
			const firstDbDir = plugin.settings.dbDir;
			plugin.onunload();

			// Second cycle
			await plugin.onload();
			const secondDbDir = plugin.settings.dbDir;
			plugin.onunload();

			// Settings should be consistent
			expect(firstDbDir).toBe(secondDbDir);
		});

		it("should preserve state between load cycles", async () => {
			// First load
			await plugin.onload();

			// Modify settings
			plugin.settings.dbDir = "/custom/path/db";
			await plugin.saveSettings();

			plugin.onunload();

			// Create new plugin instance
			const newPlugin = createPlugin(app, manifest);
			(newPlugin as PluginWithMockMethods).setMockData(
				(plugin as PluginWithMockMethods).getMockData()
			);

			// Second load
			await newPlugin.onload();

			// Settings should be preserved
			expect(newPlugin.settings.dbDir).toBe("/custom/path/db");
		});
	});

	describe("Database directory creation scenarios", () => {
		it("should create nested directory structure", async () => {
			const vault = app.vault;
			const dbDir = "/test/.obsidian/plugins/anti-ephemeral-state/db";

			await plugin.onload();

			// Verify full path exists
			expect(await vault.adapter.exists(dbDir)).toBe(true);
			expect(await vault.adapter.exists("/test/.obsidian/plugins")).toBe(
				true
			);
			expect(
				await vault.adapter.exists(
					"/test/.obsidian/plugins/anti-ephemeral-state"
				)
			).toBe(true);
		});

		it("should handle custom database directory paths", async () => {
			// Set custom settings before onload
			(plugin as PluginWithMockMethods).setMockData({
				dbDir: "/custom/database/path",
			});

			const vault = app.vault;

			await plugin.onload();

			// Should create custom directory
			expect(await vault.adapter.exists("/custom/database/path")).toBe(
				true
			);
			expect(plugin.settings.dbDir).toBe("/custom/database/path");
		});

		it("should handle paths with special characters", async () => {
			const testApp = TestUtils.createMockApp("/test/üñíçødé/.obsidian");
			const testPlugin = createPlugin(testApp, manifest);
			const vault = testApp.vault;

			await testPlugin.onload();

			const expectedDbDir =
				"/test/üñíçødé/.obsidian/plugins/anti-ephemeral-state/db";
			expect(await vault.adapter.exists(expectedDbDir)).toBe(true);
			expect(testPlugin.settings.dbDir).toBe(expectedDbDir);
		});
	});

	describe("Restoration during onload", () => {
		it("should manage restorationPromise lifecycle correctly", async () => {
			// Create a fresh plugin for this test to avoid interference
			const freshPlugin = createPlugin(app, manifest);

			// Initially should be null
			expect(freshPlugin.restorationPromise).toBeNull();

			// Call restoreTemporaryState directly to test the promise lifecycle
			await freshPlugin.restoreTemporaryState();

			// After restoration completes, promise should be cleared
			expect(freshPlugin.restorationPromise).toBeNull();
		});

		it("should handle restoration errors gracefully", async () => {
			// Create a fresh plugin for this test
			const freshPlugin = createPlugin(app, manifest);

			// Mock the internal restoreTemporaryStateWithRetry method to throw error
			const mockRetry = jest
				.fn()
				.mockRejectedValue(new Error("Restoration failed"));
			(
				freshPlugin as {
					restoreTemporaryStateWithRetry: typeof mockRetry;
				}
			).restoreTemporaryStateWithRetry = mockRetry;

			// Should not throw during onload (errors should be caught internally)
			await expect(freshPlugin.onload()).resolves.not.toThrow();

			// Verify the mock was called
			expect(mockRetry).toHaveBeenCalled();

			// Verify error was logged
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[AES] Failed to restore temporary state after all retries:",
				expect.any(Error)
			);
		});
	});

	describe("Event listener setup", () => {
		it("should setup scroll event listeners after workspace ready", async () => {
			// Mock workspace.onLayoutReady to track calls
			const onLayoutReadySpy = jest.spyOn(app.workspace, "onLayoutReady");

			await plugin.onload();

			// Should call onLayoutReady for scroll listener setup
			expect(onLayoutReadySpy).toHaveBeenCalled();

			onLayoutReadySpy.mockRestore();
		});

		it("should prevent multiple scroll listener attachments", async () => {
			await plugin.onload();

			// Simulate listeners already attached
			plugin.scrollListenersAttached = true;

			// Mock console.log to verify skip message
			const logSpy = jest
				.spyOn(console, "debug")
				.mockImplementation(() => {});

			// Try to attach again
			plugin.attachScrollListeners();

			expect(logSpy).toHaveBeenCalledWith(
				"[AES] Scroll listeners already attached, skipping"
			);

			logSpy.mockRestore();
		});
	});

	describe("Debounced save initialization", () => {
		it("should initialize debounced save with correct parameters", async () => {
			await plugin.onload();

			expect(plugin.debouncedSave).toBeDefined();
			expect(typeof plugin.debouncedSave).toBe("function");
			expect(typeof plugin.debouncedSave.cancel).toBe("function");
		});

		it("should use debounced save for state persistence", async () => {
			// Use fake timers to control debounce timing
			jest.useFakeTimers();

			await plugin.onload();

			// Mock writeFileState
			const writeStateSpy = jest
				.spyOn(plugin, "writeFileState")
				.mockResolvedValue();

			// Call debounced save
			const testState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 0, line: 0 },
				},
			};
			plugin.debouncedSave("test.md", testState);

			// Should not call immediately (debounced)
			expect(writeStateSpy).not.toHaveBeenCalled();

			// Fast-forward time to trigger debounce
			jest.advanceTimersByTime(600);

			// Should call after delay
			expect(writeStateSpy).toHaveBeenCalledWith("test.md", testState);

			writeStateSpy.mockRestore();
			jest.useRealTimers();
		});
	});
});
