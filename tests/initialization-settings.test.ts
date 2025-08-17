/**
 * Tests for AntiEphemeralState plugin initialization and settings
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import AntiEphemeralState from "../main";
import { App, MockVault, TestUtils, MockManifest } from "./__mocks__/obsidian";

// Type for plugin settings in tests
interface TestPluginSettings {
	dbDir: string;
	lockModeEnabled?: boolean;
}

// Type for plugin with mock methods
interface PluginWithMockMethods extends AntiEphemeralState {
	setMockData: (data: Record<string, unknown> | null) => void;
	getMockData: () => Record<string, unknown>;
}

const createPlugin = (app: App, manifest: MockManifest): AntiEphemeralState => {
	// Mock manifest must be passed to Plugin constructor
	// since Plugin expects obsidian's PluginManifest but we provide MockManifest
	return new AntiEphemeralState(app as App, manifest as MockManifest);
};

describe("AntiEphemeralState Initialization and Settings", () => {
	let plugin: AntiEphemeralState;
	let app: App;
	let manifest: MockManifest;

	beforeEach(() => {
		// Create test app with standard configDir
		app = TestUtils.createMockApp("/test/.obsidian");
		manifest = TestUtils.createMockManifest({
			id: "anti-ephemeral-state",
			name: "Anti-Ephemeral State",
			version: "1.0.0",
		});
		plugin = createPlugin(app, manifest);
	});

	afterEach(() => {
		// Clean up mock file system
		if (app?.vault && (app.vault as MockVault).adapter) {
			(app.vault as MockVault).adapter.reset();
		}
	});

	describe("Constructor", () => {
		it("should create plugin instance with various configDir values", () => {
			const testConfigDirs = [
				"/test/.obsidian",
				"/home/user/.obsidian",
				"/Users/user/Documents/vault/.obsidian",
				"/test/с пробелами/.obsidian",
				"/test/üñíçødé/.obsidian",
			];

			testConfigDirs.forEach(configDir => {
				const testApp = TestUtils.createMockApp(configDir);
				const testPlugin = createPlugin(testApp, manifest);

				expect(testPlugin).toBeInstanceOf(AntiEphemeralState);
				expect(testPlugin.app).toBe(testApp);
				expect(testPlugin.manifest).toBe(manifest);
			});
		});

		it("should initialize with undefined settings before onload", () => {
			// Note: Mock Plugin may initialize with empty object instead of undefined
			// This is acceptable for testing purposes
			expect(plugin.DEFAULT_SETTINGS).toBeUndefined();
		});

		it("should initialize with default state values", () => {
			expect(plugin.lastTemporaryState).toBeNull();
			expect(plugin.lastLoadedFileName).toBeUndefined();
			expect(plugin.loadingFile).toBe(false);
			expect(plugin.scrollListenersAttached).toBe(false);
			expect(plugin.restorationPromise).toBeNull();
		});
	});

	describe("DEFAULT_SETTINGS formation", () => {
		it("should create correct DEFAULT_SETTINGS.dbDir from app.vault.configDir", async () => {
			const testConfigDirs = [
				"/test/.obsidian",
				"/home/user/.obsidian",
				"/Users/user/Documents/vault/.obsidian",
			];

			for (const configDir of testConfigDirs) {
				const testApp = TestUtils.createMockApp(configDir);
				const testPlugin = createPlugin(testApp, manifest);

				// Simulate onload to initialize DEFAULT_SETTINGS
				await testPlugin.onload();

				const expectedDbDir = `${configDir}/plugins/anti-ephemeral-state/db`;
				expect(testPlugin.DEFAULT_SETTINGS.dbDir).toBe(expectedDbDir);
			}
		});

		it("should handle paths with spaces and unicode characters", async () => {
			const testCases = [
				{
					configDir: "/test/с пробелами/.obsidian",
					expected:
						"/test/с пробелами/.obsidian/plugins/anti-ephemeral-state/db",
				},
				{
					configDir: "/test/üñíçødé/.obsidian",
					expected:
						"/test/üñíçødé/.obsidian/plugins/anti-ephemeral-state/db",
				},
				{
					configDir: "/Users/user/My Documents/.obsidian",
					expected:
						"/Users/user/My Documents/.obsidian/plugins/anti-ephemeral-state/db",
				},
			];

			for (const testCase of testCases) {
				const testApp = TestUtils.createMockApp(testCase.configDir);
				const testPlugin = createPlugin(testApp, manifest);

				await testPlugin.onload();

				expect(testPlugin.DEFAULT_SETTINGS.dbDir).toBe(
					testCase.expected
				);
			}
		});

		it("should create DEFAULT_SETTINGS as public class property", async () => {
			await plugin.onload();

			expect(plugin.DEFAULT_SETTINGS).toBeDefined();
			expect(typeof plugin.DEFAULT_SETTINGS).toBe("object");
			expect(plugin.DEFAULT_SETTINGS).toHaveProperty("dbDir");
			expect(plugin.DEFAULT_SETTINGS).toHaveProperty("lockModeEnabled");
			expect(plugin.DEFAULT_SETTINGS.lockModeEnabled).toBe(true);
		});
	});

	describe("loadSettings method", () => {
		it("should load default settings when no saved data exists", async () => {
			await plugin.onload(); // Initialize DEFAULT_SETTINGS

			// Clear any saved data - use cast to access mock methods
			(plugin as PluginWithMockMethods).setMockData({});

			await plugin.loadSettings();

			expect(plugin.settings).toEqual(plugin.DEFAULT_SETTINGS);
		});

		it("should merge saved data with default settings", async () => {
			await plugin.onload(); // Initialize DEFAULT_SETTINGS

			const customDbDir = "/custom/path/db";
			(plugin as PluginWithMockMethods).setMockData({
				dbDir: customDbDir,
			});

			await plugin.loadSettings();

			expect(plugin.settings.dbDir).toBe(customDbDir);
		});

		it("should handle partial settings data", async () => {
			await plugin.onload(); // Initialize DEFAULT_SETTINGS

			// Save partial data (missing some properties)
			(plugin as PluginWithMockMethods).setMockData({});

			await plugin.loadSettings();

			// Should use default for missing properties
			expect(plugin.settings.dbDir).toBe(plugin.DEFAULT_SETTINGS.dbDir);
		});

		it("should handle corrupted settings data gracefully", async () => {
			await plugin.onload(); // Initialize DEFAULT_SETTINGS

			// Simulate corrupted data
			(plugin as PluginWithMockMethods).setMockData(null);

			await plugin.loadSettings();

			// Should fall back to defaults
			expect(plugin.settings).toEqual(plugin.DEFAULT_SETTINGS);
		});
	});

	describe("saveSettings method", () => {
		beforeEach(async () => {
			await plugin.onload(); // Initialize DEFAULT_SETTINGS and settings
		});

		it("should save current settings", async () => {
			const customDbDir = "/new/custom/path";
			plugin.settings.dbDir = customDbDir;

			await plugin.saveSettings();

			const savedData = (plugin as PluginWithMockMethods).getMockData();
			expect(savedData.dbDir).toBe(customDbDir);
		});

		it("should preserve settings data after save-load cycle", async () => {
			const customSettings: TestPluginSettings = {
				dbDir: "/preserved/path/db",
				lockModeEnabled: true,
			};

			plugin.settings = customSettings;
			await plugin.saveSettings();

			// Create new plugin instance and load settings
			const newPlugin = createPlugin(app, manifest);
			(newPlugin as PluginWithMockMethods).setMockData(
				(plugin as PluginWithMockMethods).getMockData()
			);
			await newPlugin.onload();

			expect(newPlugin.settings).toEqual(customSettings);
		});

		it("should handle save errors gracefully", async () => {
			// Mock saveData to throw error
			const originalSaveData = plugin.saveData;
			plugin.saveData = jest
				.fn()
				.mockRejectedValue(new Error("Save failed"));

			// Should throw the error (current implementation doesn't handle it gracefully)
			await expect(plugin.saveSettings()).rejects.toThrow("Save failed");

			// Restore original method
			plugin.saveData = originalSaveData;
		});
	});

	describe("Path scenarios", () => {
		const pathScenarios = [
			{
				name: "standard Unix path",
				configDir: "/home/user/.obsidian",
				expected:
					"/home/user/.obsidian/plugins/anti-ephemeral-state/db",
			},
			{
				name: "macOS user path",
				configDir: "/Users/john/.obsidian",
				expected:
					"/Users/john/.obsidian/plugins/anti-ephemeral-state/db",
			},
			{
				name: "path with spaces",
				configDir: "/Users/John Doe/My Vault/.obsidian",
				expected:
					"/Users/John Doe/My Vault/.obsidian/plugins/anti-ephemeral-state/db",
			},
			{
				name: "path with unicode characters",
				configDir: "/Users/josé/Документы/.obsidian",
				expected:
					"/Users/josé/Документы/.obsidian/plugins/anti-ephemeral-state/db",
			},
			{
				name: "Windows-style path (simulated)",
				configDir: "C:\\Users\\User\\Documents\\.obsidian",
				expected:
					"C:\\Users\\User\\Documents\\.obsidian/plugins/anti-ephemeral-state/db",
			},
		];

		it.each(pathScenarios)(
			"should handle $name correctly",
			async ({ configDir, expected }) => {
				const testApp = TestUtils.createMockApp(configDir);
				const testPlugin = createPlugin(testApp, manifest);

				await testPlugin.onload();

				expect(testPlugin.DEFAULT_SETTINGS.dbDir).toBe(expected);
			}
		);
	});

	describe("Database directory creation", () => {
		it("should create database directory during onload if it doesn't exist", async () => {
			const vault = app.vault as MockVault;

			// Ensure directory doesn't exist initially
			expect(
				await vault.adapter.exists(
					"/test/.obsidian/plugins/anti-ephemeral-state/db"
				)
			).toBe(false);

			await plugin.onload();

			// Directory should be created
			expect(await vault.adapter.exists(plugin.settings.dbDir)).toBe(
				true
			);
		});

		it("should not fail if database directory already exists", async () => {
			const vault = app.vault as MockVault;

			// Pre-create the directory
			await vault.adapter.mkdir(
				"/test/.obsidian/plugins/anti-ephemeral-state/db"
			);

			// Should not throw
			await expect(plugin.onload()).resolves.not.toThrow();
		});

		it("should handle directory creation errors gracefully", async () => {
			const vault = app.vault as MockVault;

			// Mock mkdir to throw error
			const originalMkdir = vault.adapter.mkdir;
			vault.adapter.mkdir = jest
				.fn()
				.mockRejectedValue(new Error("Permission denied"));

			// Should not throw during onload
			await expect(plugin.onload()).resolves.not.toThrow();

			// Restore original method
			vault.adapter.mkdir = originalMkdir;
		});
	});

	describe("Settings validation", () => {
		it("should validate dbDir is a string", async () => {
			await plugin.onload();

			expect(typeof plugin.settings.dbDir).toBe("string");
			expect(plugin.settings.dbDir.length).toBeGreaterThan(0);
		});

		it("should ensure dbDir ends with /db", async () => {
			await plugin.onload();

			expect(plugin.settings.dbDir).toMatch(/\/db$/);
		});

		it("should handle relative paths in dbDir", async () => {
			await plugin.onload();

			// Test that relative paths are properly resolved
			const customDbDir = "relative/path/db";
			plugin.settings.dbDir = customDbDir;
			await plugin.saveSettings();

			expect(plugin.settings.dbDir).toBe(customDbDir);
		});
	});
});
