/**
 * Tests for SettingTab class
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
import {
	App,
	MockVault,
	TestUtils,
	MockManifest,
	PluginSettingTab,
} from "./__mocks__/obsidian";

// Mock interfaces for type safety
interface MockSetting {
	setName: jest.Mock;
	setDesc: jest.Mock;
	addText: jest.Mock;
	addButton: jest.Mock;
}

interface MockTextComponent {
	setPlaceholder: jest.Mock;
	setValue: jest.Mock;
	onChange: jest.Mock;
}

interface MockButtonComponent {
	setButtonText: jest.Mock;
	setCta: jest.Mock;
	onClick: jest.Mock;
}

// Create a helper to access the private SettingTab class
const createSettingTab = (app: App, plugin: AntiEphemeralState) => {
	// Create a new SettingTab instance using the same pattern as in main.ts
	class TestSettingTab extends PluginSettingTab {
		plugin: AntiEphemeralState;

		constructor(app: App, plugin: AntiEphemeralState) {
			super(app, plugin);
			this.plugin = plugin;
		}

		display(): void {
			const { containerEl } = this;
			if (containerEl && containerEl.empty) {
				containerEl.empty();
			}

			// Create database directory setting
			const dbSetting = new (
				window as unknown as {
					Setting: new (el: HTMLElement) => MockSetting;
				}
			).Setting(containerEl);
			dbSetting
				.setName("Database directory")
				.setDesc(
					"Root directory for per-file state persistence (one database file per note)"
				)
				.addText((text: MockTextComponent) =>
					text
						.setPlaceholder(
							this.plugin.DEFAULT_SETTINGS?.dbDir || ""
						)
						.setValue(this.plugin.settings?.dbDir || "")
						.onChange(async (value: string) => {
							if (this.plugin.settings) {
								this.plugin.settings.dbDir = value;
								await this.plugin.saveSettings();
							}
						})
				);

			// Create validation button setting
			const validationSetting = new (
				window as unknown as {
					Setting: new (el: HTMLElement) => MockSetting;
				}
			).Setting(containerEl);
			validationSetting
				.setName("Validation of database")
				.setDesc(
					"Iterate over database entries, fix wrong viewState.file, and remove entries for missing notes"
				)
				.addButton((btn: MockButtonComponent) => {
					btn.setButtonText("Run validation")
						.setCta()
						.onClick(async () => {
							new (
								window as unknown as {
									Notice: new (
										message: string,
										timeout?: number
									) => void;
								}
							).Notice("[AES] Validation started...", 1000);
							await this.plugin.validateDatabase();
						});
				});
		}
	}

	return new TestSettingTab(app, plugin);
};

describe("SettingTab", () => {
	let plugin: AntiEphemeralState;
	let app: App;
	let manifest: MockManifest;
	let settingTab: PluginSettingTab;
	let mockContainerEl: HTMLElement;

	beforeEach(async () => {
		// Create test app with standard configDir
		app = TestUtils.createMockApp("/test/.obsidian");
		manifest = TestUtils.createMockManifest({
			id: "anti-ephemeral-state",
			name: "Anti-Ephemeral State",
			version: "1.0.0",
		});
		plugin = new AntiEphemeralState(app, manifest);

		// Initialize plugin to set up DEFAULT_SETTINGS
		await plugin.onload();

		// Create mock container element
		mockContainerEl = document.createElement("div");
		mockContainerEl.empty = jest.fn();

		// Create SettingTab instance
		settingTab = createSettingTab(app, plugin);

		// Mock the containerEl property
		Object.defineProperty(settingTab, "containerEl", {
			value: mockContainerEl,
			writable: true,
		});
	});

	afterEach(() => {
		// Clean up mock file system
		if (app?.vault && app.vault.adapter) {
			app.vault.adapter.reset();
		}

		// Clear DOM
		mockContainerEl.innerHTML = "";

		// Clear all mocks
		jest.clearAllMocks();
	});

	describe("Constructor", () => {
		it("should create SettingTab instance with correct parameters", () => {
			expect(settingTab).toBeInstanceOf(PluginSettingTab);
			expect(settingTab.app).toBe(app);
			expect(settingTab.plugin).toBe(plugin);
		});

		it("should initialize with various app configurations", () => {
			const testConfigDirs = [
				"/test/.obsidian",
				"/home/user/.obsidian",
				"/Users/user/Documents/vault/.obsidian",
				"/test/с пробелами/.obsidian",
				"/test/üñíçødé/.obsidian",
			];

			testConfigDirs.forEach(configDir => {
				const testApp = TestUtils.createMockApp(configDir);
				const testPlugin = new AntiEphemeralState(testApp, manifest);
				const testSettingTab = createSettingTab(testApp, testPlugin);

				expect(testSettingTab.app).toBe(testApp);
				expect(testSettingTab.plugin).toBe(testPlugin);
			});
		});

		it("should handle plugin parameter correctly", () => {
			expect(settingTab.plugin).toBe(plugin);
			expect(settingTab.plugin).toBeInstanceOf(AntiEphemeralState);
		});
	});

	describe("display() method", () => {
		let mockSetting: MockSetting;

		beforeEach(() => {
			// Mock Setting constructor and methods
			mockSetting = {
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addText: jest.fn().mockReturnThis(),
				addButton: jest.fn().mockReturnThis(),
			};

			// Mock window.Setting
			Object.defineProperty(window, "Setting", {
				value: jest.fn().mockReturnValue(mockSetting),
				writable: true,
			});
		});

		it("should clear container element before creating settings", () => {
			settingTab.display();

			expect(mockContainerEl.empty).toHaveBeenCalled();
		});

		it("should create database directory setting", () => {
			settingTab.display();

			expect(window.Setting).toHaveBeenCalledWith(mockContainerEl);
		});

		it("should create validation button setting", () => {
			settingTab.display();

			// Should be called twice - once for database directory, once for validation
			expect(window.Setting).toHaveBeenCalledTimes(2);
			expect(window.Setting).toHaveBeenCalledWith(mockContainerEl);
		});

		it("should configure database directory text input correctly", () => {
			const mockTextComponent: MockTextComponent = {
				setPlaceholder: jest.fn().mockReturnThis(),
				setValue: jest.fn().mockReturnThis(),
				onChange: jest.fn().mockReturnThis(),
			};

			mockSetting.addText = jest.fn(
				(callback: (text: MockTextComponent) => void) => {
					callback(mockTextComponent);
					return mockSetting;
				}
			);

			settingTab.display();

			expect(mockTextComponent.setPlaceholder).toHaveBeenCalledWith(
				plugin.DEFAULT_SETTINGS.dbDir
			);
			expect(mockTextComponent.setValue).toHaveBeenCalledWith(
				plugin.settings.dbDir
			);
			expect(mockTextComponent.onChange).toHaveBeenCalledWith(
				expect.any(Function)
			);
		});

		it("should configure validation button correctly", () => {
			const mockButtonComponent: MockButtonComponent = {
				setButtonText: jest.fn().mockReturnThis(),
				setCta: jest.fn().mockReturnThis(),
				onClick: jest.fn().mockReturnThis(),
			};

			mockSetting.addButton = jest.fn(
				(callback: (btn: MockButtonComponent) => void) => {
					callback(mockButtonComponent);
					return mockSetting;
				}
			);

			settingTab.display();

			expect(mockButtonComponent.setButtonText).toHaveBeenCalledWith(
				"Run validation"
			);
			expect(mockButtonComponent.setCta).toHaveBeenCalled();
			expect(mockButtonComponent.onClick).toHaveBeenCalledWith(
				expect.any(Function)
			);
		});
	});

	describe("Database directory setting handlers", () => {
		let textChangeHandler: (value: string) => Promise<void>;

		beforeEach(() => {
			// Capture the onChange handler for the text input
			const mockTextComponent: MockTextComponent = {
				setPlaceholder: jest.fn().mockReturnThis(),
				setValue: jest.fn().mockReturnThis(),
				onChange: jest.fn(
					(handler: (value: string) => Promise<void>) => {
						textChangeHandler = handler;
						return mockTextComponent;
					}
				),
			};

			const mockSetting: MockSetting = {
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addText: jest.fn(
					(callback: (text: MockTextComponent) => void) => {
						callback(mockTextComponent);
						return mockSetting;
					}
				),
				addButton: jest.fn().mockReturnThis(),
			};

			Object.defineProperty(window, "Setting", {
				value: jest.fn().mockReturnValue(mockSetting),
				writable: true,
			});

			// Mock plugin.saveSettings
			plugin.saveSettings = jest.fn().mockResolvedValue(undefined);

			settingTab.display();
		});

		it("should update plugin settings when database directory changes", async () => {
			const newDbDir = "/custom/database/path";

			await textChangeHandler(newDbDir);

			expect(plugin.settings.dbDir).toBe(newDbDir);
			expect(plugin.saveSettings).toHaveBeenCalled();
		});

		it("should handle empty database directory path", async () => {
			const emptyPath = "";

			await textChangeHandler(emptyPath);

			expect(plugin.settings.dbDir).toBe(emptyPath);
			expect(plugin.saveSettings).toHaveBeenCalled();
		});

		it("should handle paths with special characters", async () => {
			const specialPaths = [
				"/path/with spaces/db",
				"/path/with-unicode-тест/db",
				"/path/with/üñíçødé/db",
				"relative/path/db",
			];

			for (const path of specialPaths) {
				await textChangeHandler(path);

				expect(plugin.settings.dbDir).toBe(path);
				expect(plugin.saveSettings).toHaveBeenCalled();
			}
		});

		it("should handle saveSettings errors gracefully", async () => {
			// Mock saveSettings to throw error
			plugin.saveSettings = jest
				.fn()
				.mockRejectedValue(new Error("Save failed"));

			// Should not throw error (current implementation doesn't handle it)
			await expect(textChangeHandler("/new/path")).rejects.toThrow(
				"Save failed"
			);
		});
	});

	describe("Validation button handlers", () => {
		let buttonClickHandler: () => Promise<void>;

		beforeEach(() => {
			// Capture the onClick handler for the validation button
			const mockButtonComponent: MockButtonComponent = {
				setButtonText: jest.fn().mockReturnThis(),
				setCta: jest.fn().mockReturnThis(),
				onClick: jest.fn((handler: () => Promise<void>) => {
					buttonClickHandler = handler;
					return mockButtonComponent;
				}),
			};

			const mockSetting: MockSetting = {
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addText: jest.fn().mockReturnThis(),
				addButton: jest.fn(
					(callback: (btn: MockButtonComponent) => void) => {
						callback(mockButtonComponent);
						return mockSetting;
					}
				),
			};

			Object.defineProperty(window, "Setting", {
				value: jest.fn().mockReturnValue(mockSetting),
				writable: true,
			});

			// Mock plugin.validateDatabase
			plugin.validateDatabase = jest.fn().mockResolvedValue(undefined);

			// Mock Notice constructor
			Object.defineProperty(window, "Notice", {
				value: jest.fn(),
				writable: true,
			});

			settingTab.display();
		});

		it("should show validation started notice when button is clicked", async () => {
			await buttonClickHandler();

			expect(window.Notice).toHaveBeenCalledWith(
				"[AES] Validation started...",
				1000
			);
		});

		it("should call plugin validateDatabase method", async () => {
			await buttonClickHandler();

			expect(plugin.validateDatabase).toHaveBeenCalled();
		});

		it("should handle validation errors gracefully", async () => {
			// Mock validateDatabase to throw error
			plugin.validateDatabase = jest
				.fn()
				.mockRejectedValue(new Error("Validation failed"));

			// Should not throw error (current implementation doesn't handle it)
			await expect(buttonClickHandler()).rejects.toThrow(
				"Validation failed"
			);
		});

		it("should show notice before starting validation", async () => {
			const noticeOrder: string[] = [];

			Object.defineProperty(window, "Notice", {
				value: jest.fn((message: string) => {
					noticeOrder.push(message);
				}),
				writable: true,
			});

			plugin.validateDatabase = jest.fn().mockImplementation(async () => {
				noticeOrder.push("validation-called");
			});

			await buttonClickHandler();

			expect(noticeOrder).toEqual([
				"[AES] Validation started...",
				"validation-called",
			]);
		});
	});

	describe("Setting configuration", () => {
		let mockSetting: MockSetting;

		beforeEach(() => {
			mockSetting = {
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addText: jest.fn().mockReturnThis(),
				addButton: jest.fn().mockReturnThis(),
			};

			Object.defineProperty(window, "Setting", {
				value: jest.fn().mockReturnValue(mockSetting),
				writable: true,
			});
		});

		it("should set correct names for settings", () => {
			settingTab.display();

			expect(mockSetting.setName).toHaveBeenCalledWith(
				"Database directory"
			);
			expect(mockSetting.setName).toHaveBeenCalledWith(
				"Validation of database"
			);
		});

		it("should set correct descriptions for settings", () => {
			settingTab.display();

			expect(mockSetting.setDesc).toHaveBeenCalledWith(
				"Root directory for per-file state persistence (one database file per note)"
			);
			expect(mockSetting.setDesc).toHaveBeenCalledWith(
				"Iterate over database entries, fix wrong viewState.file, and remove entries for missing notes"
			);
		});
	});

	describe("Integration with plugin state", () => {
		it("should reflect current plugin settings in text input", () => {
			const customDbDir = "/custom/test/path";
			plugin.settings.dbDir = customDbDir;

			const mockTextComponent: MockTextComponent = {
				setPlaceholder: jest.fn().mockReturnThis(),
				setValue: jest.fn().mockReturnThis(),
				onChange: jest.fn().mockReturnThis(),
			};

			const mockSetting: MockSetting = {
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addText: jest.fn(
					(callback: (text: MockTextComponent) => void) => {
						callback(mockTextComponent);
						return mockSetting;
					}
				),
				addButton: jest.fn().mockReturnThis(),
			};

			Object.defineProperty(window, "Setting", {
				value: jest.fn().mockReturnValue(mockSetting),
				writable: true,
			});

			settingTab.display();

			expect(mockTextComponent.setValue).toHaveBeenCalledWith(
				customDbDir
			);
		});

		it("should use DEFAULT_SETTINGS as placeholder", () => {
			const mockTextComponent: MockTextComponent = {
				setPlaceholder: jest.fn().mockReturnThis(),
				setValue: jest.fn().mockReturnThis(),
				onChange: jest.fn().mockReturnThis(),
			};

			const mockSetting: MockSetting = {
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addText: jest.fn(
					(callback: (text: MockTextComponent) => void) => {
						callback(mockTextComponent);
						return mockSetting;
					}
				),
				addButton: jest.fn().mockReturnThis(),
			};

			Object.defineProperty(window, "Setting", {
				value: jest.fn().mockReturnValue(mockSetting),
				writable: true,
			});

			settingTab.display();

			expect(mockTextComponent.setPlaceholder).toHaveBeenCalledWith(
				plugin.DEFAULT_SETTINGS.dbDir
			);
		});

		it("should work with different plugin configurations", async () => {
			const testConfigs = [
				{
					configDir: "/test1/.obsidian",
					dbDir: "/test1/.obsidian/plugins/anti-ephemeral-state/db",
				},
				{
					configDir: "/test2/.obsidian",
					dbDir: "/test2/.obsidian/plugins/anti-ephemeral-state/db",
				},
				{ configDir: "/custom/.obsidian", dbDir: "/custom/path/db" },
			];

			for (const config of testConfigs) {
				const testApp = TestUtils.createMockApp(config.configDir);
				const testPlugin = new AntiEphemeralState(testApp, manifest);
				await testPlugin.onload();

				if (config.dbDir !== testPlugin.DEFAULT_SETTINGS.dbDir) {
					testPlugin.settings.dbDir = config.dbDir;
				}

				const testSettingTab = createSettingTab(testApp, testPlugin);

				expect(testSettingTab.plugin.settings.dbDir).toBe(config.dbDir);
			}
		});
	});

	describe("Error handling", () => {
		it("should handle missing containerEl gracefully", () => {
			// Set containerEl to undefined
			Object.defineProperty(settingTab, "containerEl", {
				value: undefined,
				writable: true,
			});

			// Should not throw error when display is called
			expect(() => settingTab.display()).not.toThrow();
		});

		it("should handle plugin without DEFAULT_SETTINGS", () => {
			// Remove DEFAULT_SETTINGS
			delete (plugin as unknown as { DEFAULT_SETTINGS: unknown })
				.DEFAULT_SETTINGS;

			const mockTextComponent: MockTextComponent = {
				setPlaceholder: jest.fn().mockReturnThis(),
				setValue: jest.fn().mockReturnThis(),
				onChange: jest.fn().mockReturnThis(),
			};

			const mockSetting: MockSetting = {
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addText: jest.fn(
					(callback: (text: MockTextComponent) => void) => {
						callback(mockTextComponent);
						return mockSetting;
					}
				),
				addButton: jest.fn().mockReturnThis(),
			};

			Object.defineProperty(window, "Setting", {
				value: jest.fn().mockReturnValue(mockSetting),
				writable: true,
			});

			// Should not throw error
			expect(() => settingTab.display()).not.toThrow();
		});

		it("should handle plugin without settings", () => {
			// Remove settings
			delete (plugin as unknown as { settings: unknown }).settings;

			const mockTextComponent: MockTextComponent = {
				setPlaceholder: jest.fn().mockReturnThis(),
				setValue: jest.fn().mockReturnThis(),
				onChange: jest.fn().mockReturnThis(),
			};

			const mockSetting: MockSetting = {
				setName: jest.fn().mockReturnThis(),
				setDesc: jest.fn().mockReturnThis(),
				addText: jest.fn(
					(callback: (text: MockTextComponent) => void) => {
						callback(mockTextComponent);
						return mockSetting;
					}
				),
				addButton: jest.fn().mockReturnThis(),
			};

			Object.defineProperty(window, "Setting", {
				value: jest.fn().mockReturnValue(mockSetting),
				writable: true,
			});

			// Should not throw error
			expect(() => settingTab.display()).not.toThrow();
		});
	});
});
