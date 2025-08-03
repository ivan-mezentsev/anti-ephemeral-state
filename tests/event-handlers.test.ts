/**
 * Tests for event handlers in AntiEphemeralState plugin
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
	TFile,
	MarkdownView,
	Editor,
} from "./__mocks__/obsidian";

const createPlugin = (app: App, manifest: MockManifest): AntiEphemeralState => {
	return new AntiEphemeralState(app as App, manifest as MockManifest);
};

describe("AntiEphemeralState Event Handlers", () => {
	let plugin: AntiEphemeralState;
	let app: App;
	let manifest: MockManifest;
	let mockFile: TFile;
	let mockView: MarkdownView;
	let mockEditor: Editor;

	beforeEach(async () => {
		// Create test app with standard configDir
		app = TestUtils.createMockApp("/test/.obsidian");
		manifest = TestUtils.createMockManifest({
			id: "anti-ephemeral-state",
			name: "Anti-Ephemeral State",
			version: "1.0.0",
		});
		plugin = createPlugin(app, manifest);

		// Initialize plugin to set up DEFAULT_SETTINGS
		await plugin.onload();

		// Create mock file and view
		mockFile = TestUtils.createMockFile("test.md");
		mockView = new MarkdownView(mockFile);
		mockEditor = new Editor();

		// Setup mock DOM environment
		if (typeof document !== "undefined") {
			document.body.innerHTML = `
				<div class="workspace">
					<div class="workspace-leaf-content">
						<div class="cm-editor"></div>
					</div>
				</div>
			`;
		}

		// Mock workspace methods
		jest.spyOn(app.workspace, "getActiveViewOfType").mockReturnValue(
			mockView
		);
		jest.spyOn(app.workspace, "getActiveFile").mockReturnValue(mockFile);

		// Set the editor directly on the mock view
		mockView.editor = mockEditor;

		// Clear any existing timers
		jest.clearAllTimers();
		jest.useFakeTimers();
	});

	afterEach(() => {
		// Clean up mock file system
		if (app?.vault && (app.vault as MockVault).adapter) {
			(app.vault as MockVault).adapter.reset();
		}

		// Restore timers
		jest.useRealTimers();
		jest.clearAllMocks();
	});

	describe("Event Registration in onload", () => {
		it("should register file-open event handler", async () => {
			const workspaceOnSpy = jest.spyOn(app.workspace, "on");

			// Create new plugin to test onload registration
			const newPlugin = createPlugin(app, manifest);
			await newPlugin.onload();

			expect(workspaceOnSpy).toHaveBeenCalledWith(
				"file-open",
				expect.any(Function)
			);
		});

		it("should register vault rename event handler", async () => {
			const vaultOnSpy = jest.spyOn(app.vault, "on");

			// Create new plugin to test onload registration
			const newPlugin = createPlugin(app, manifest);
			await newPlugin.onload();

			expect(vaultOnSpy).toHaveBeenCalledWith(
				"rename",
				expect.any(Function)
			);
		});

		it("should register vault delete event handler", async () => {
			const vaultOnSpy = jest.spyOn(app.vault, "on");

			// Create new plugin to test onload registration
			const newPlugin = createPlugin(app, manifest);
			await newPlugin.onload();

			expect(vaultOnSpy).toHaveBeenCalledWith(
				"delete",
				expect.any(Function)
			);
		});

		it("should register editor-change event handler", async () => {
			const workspaceOnSpy = jest.spyOn(app.workspace, "on");

			// Create new plugin to test onload registration
			const newPlugin = createPlugin(app, manifest);
			await newPlugin.onload();

			expect(workspaceOnSpy).toHaveBeenCalledWith(
				"editor-change",
				expect.any(Function)
			);
		});

		it("should register layout-change event handler", async () => {
			const workspaceOnSpy = jest.spyOn(app.workspace, "on");

			// Create new plugin to test onload registration
			const newPlugin = createPlugin(app, manifest);
			await newPlugin.onload();

			expect(workspaceOnSpy).toHaveBeenCalledWith(
				"layout-change",
				expect.any(Function)
			);
		});

		it("should register active-leaf-change event handler", async () => {
			const workspaceOnSpy = jest.spyOn(app.workspace, "on");

			// Create new plugin to test onload registration
			const newPlugin = createPlugin(app, manifest);
			await newPlugin.onload();

			expect(workspaceOnSpy).toHaveBeenCalledWith(
				"active-leaf-change",
				expect.any(Function)
			);
		});
	});

	describe("file-open Event Handler", () => {
		it("should handle file-open event with valid file", async () => {
			jest.spyOn(plugin, "readFileState").mockResolvedValue(null);

			// Set up plugin state
			plugin.loadingFile = false;
			plugin.lastLoadedFileName = "";

			// Trigger file-open event
			app.workspace.trigger("file-open", mockFile);

			// Wait for async operations
			await jest.runAllTimersAsync();

			expect(plugin.loadingFile).toBe(true);
			expect(plugin.lastLoadedFileName).toBe(mockFile.path);
		});

		it("should handle file-open event with null file", async () => {
			const readFileStateSpy = jest.spyOn(plugin, "readFileState");

			// Trigger file-open event with null
			app.workspace.trigger("file-open", null);

			// Wait for async operations
			await jest.runAllTimersAsync();

			expect(readFileStateSpy).not.toHaveBeenCalled();
		});

		it("should restore state when file has saved state", async () => {
			const mockState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 0 },
				},
				scroll: 100,
				viewState: { type: "markdown", file: mockFile.path },
			};

			jest.spyOn(plugin, "readFileState").mockResolvedValue(mockState);
			const setTemporaryStateSpy = jest.spyOn(
				plugin,
				"setTemporaryState"
			);
			jest.spyOn(app.workspace, "revealLeaf").mockResolvedValue();

			// Trigger file-open event
			app.workspace.trigger("file-open", mockFile);

			// Wait for layout-change to be triggered
			await jest.runAllTimersAsync();

			// Trigger layout-change event to complete the flow
			app.workspace.trigger("layout-change");

			await jest.runAllTimersAsync();

			expect(setTemporaryStateSpy).toHaveBeenCalledWith(mockState);
			expect(plugin.loadingFile).toBe(false);
		});

		it("should handle file-open when no saved state exists", async () => {
			jest.spyOn(plugin, "readFileState").mockResolvedValue(null);
			const setTemporaryStateSpy = jest.spyOn(
				plugin,
				"setTemporaryState"
			);

			// Trigger file-open event
			app.workspace.trigger("file-open", mockFile);

			// Wait for layout-change to be triggered
			await jest.runAllTimersAsync();

			// Trigger layout-change event to complete the flow
			app.workspace.trigger("layout-change");

			await jest.runAllTimersAsync();

			expect(setTemporaryStateSpy).not.toHaveBeenCalled();
			expect(plugin.loadingFile).toBe(false);
		});

		it("should register one-time layout-change handler", async () => {
			const workspaceOnSpy = jest.spyOn(app.workspace, "on");
			const workspaceOffSpy = jest.spyOn(app.workspace, "off");

			// Trigger file-open event
			app.workspace.trigger("file-open", mockFile);

			await jest.runAllTimersAsync();

			// Should register layout-change handler
			expect(workspaceOnSpy).toHaveBeenCalledWith(
				"layout-change",
				expect.any(Function)
			);

			// Trigger layout-change to complete the flow
			app.workspace.trigger("layout-change");

			await jest.runAllTimersAsync();

			// Should unregister the one-time handler
			expect(workspaceOffSpy).toHaveBeenCalledWith(
				"layout-change",
				expect.any(Function)
			);
		});
	});

	describe("editor-change Event Handler", () => {
		it("should call checkTemporaryStateChanged on editor-change", () => {
			const checkStateSpy = jest.spyOn(
				plugin,
				"checkTemporaryStateChanged"
			);

			// Trigger editor-change event
			app.workspace.trigger("editor-change");

			expect(checkStateSpy).toHaveBeenCalled();
		});

		it("should call onEditorChange method", () => {
			const onEditorChangeSpy = jest.spyOn(plugin, "onEditorChange");

			// Trigger editor-change event
			app.workspace.trigger("editor-change");

			expect(onEditorChangeSpy).toHaveBeenCalled();
		});
	});

	describe("layout-change Event Handler", () => {
		it("should call checkTemporaryStateChanged on layout-change", () => {
			const checkStateSpy = jest.spyOn(
				plugin,
				"checkTemporaryStateChanged"
			);

			// Trigger layout-change event
			app.workspace.trigger("layout-change");

			expect(checkStateSpy).toHaveBeenCalled();
		});

		it("should call onLayoutChange method", () => {
			const onLayoutChangeSpy = jest.spyOn(plugin, "onLayoutChange");

			// Trigger layout-change event
			app.workspace.trigger("layout-change");

			expect(onLayoutChangeSpy).toHaveBeenCalled();
		});
	});

	describe("active-leaf-change Event Handler", () => {
		it("should call checkTemporaryStateChanged on active-leaf-change", () => {
			const checkStateSpy = jest.spyOn(
				plugin,
				"checkTemporaryStateChanged"
			);

			// Trigger active-leaf-change event
			app.workspace.trigger("active-leaf-change");

			expect(checkStateSpy).toHaveBeenCalled();
		});

		it("should call onActiveLeafChange method", () => {
			const onActiveLeafChangeSpy = jest.spyOn(
				plugin,
				"onActiveLeafChange"
			);

			// Trigger active-leaf-change event
			app.workspace.trigger("active-leaf-change");

			expect(onActiveLeafChangeSpy).toHaveBeenCalled();
		});
	});

	describe("DOM Event Listeners", () => {
		it("should setup DOM event listeners during onload", async () => {
			// Create new plugin to test onload
			const newPlugin = createPlugin(app, manifest);
			const setupDOMEventListenersSpy = jest.spyOn(
				newPlugin,
				"setupDOMEventListeners"
			);

			await newPlugin.onload();

			expect(setupDOMEventListenersSpy).toHaveBeenCalled();
		});

		it("should handle mouseup events", () => {
			const checkStateSpy = jest.spyOn(
				plugin,
				"checkTemporaryStateChanged"
			);

			// Simulate mouseup event
			const mouseEvent = new Event("mouseup");
			document.dispatchEvent(mouseEvent);

			expect(checkStateSpy).toHaveBeenCalled();
		});

		it("should handle navigation keyup events", () => {
			const checkStateSpy = jest.spyOn(
				plugin,
				"checkTemporaryStateChanged"
			);

			const navigationKeys = [
				"ArrowUp",
				"ArrowDown",
				"ArrowLeft",
				"ArrowRight",
				"Home",
				"End",
				"PageUp",
				"PageDown",
			];

			navigationKeys.forEach(key => {
				checkStateSpy.mockClear();
				const keyEvent = new KeyboardEvent("keyup", { key });
				document.dispatchEvent(keyEvent);

				expect(checkStateSpy).toHaveBeenCalled();
			});
		});

		it("should ignore non-navigation keyup events", () => {
			const checkStateSpy = jest.spyOn(
				plugin,
				"checkTemporaryStateChanged"
			);

			const nonNavigationKeys = ["a", "Enter", "Space", "Tab", "Escape"];

			nonNavigationKeys.forEach(key => {
				checkStateSpy.mockClear();
				const keyEvent = new KeyboardEvent("keyup", { key });
				document.dispatchEvent(keyEvent);

				expect(checkStateSpy).not.toHaveBeenCalled();
			});
		});
	});

	describe("Scroll Event Listeners", () => {
		it("should setup scroll event listeners", async () => {
			const attachScrollListenersSpy = jest.spyOn(
				plugin,
				"attachScrollListeners"
			);

			// Create new plugin to test onload
			const newPlugin = createPlugin(app, manifest);
			await newPlugin.onload();

			// Wait for onLayoutReady callback
			await jest.runAllTimersAsync();

			expect(attachScrollListenersSpy).toHaveBeenCalled();
		});

		it("should prevent multiple scroll listener attachments", async () => {
			const newPlugin = createPlugin(app, manifest);
			await newPlugin.onload();

			// Wait for initial attachment
			await jest.runAllTimersAsync();

			expect(newPlugin.scrollListenersAttached).toBe(true);

			// Try to attach again
			const registerDomEventSpy = jest.spyOn(
				newPlugin,
				"registerDomEvent"
			);
			newPlugin.attachScrollListeners();

			// Should not register new listeners
			expect(registerDomEventSpy).not.toHaveBeenCalled();
		});
	});

	describe("Debounced Save Functionality", () => {
		it("should initialize debounced save function", () => {
			expect(plugin.debouncedSave).toBeDefined();
			expect(typeof plugin.debouncedSave).toBe("function");
		});

		it("should use debounced save in saveTemporaryState", async () => {
			const debouncedSaveSpy = jest.spyOn(plugin, "debouncedSave");
			const mockState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 0 },
				},
			};

			// Set up plugin state
			plugin.lastLoadedFileName = mockFile.path;

			await plugin.saveTemporaryState(mockState);

			expect(debouncedSaveSpy).toHaveBeenCalledWith(
				mockFile.path,
				mockState
			);
		});

		it("should debounce multiple rapid save calls", async () => {
			const writeFileStateSpy = jest
				.spyOn(plugin, "writeFileState")
				.mockResolvedValue();
			const mockState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 0 },
				},
			};

			// Set up plugin state
			plugin.lastLoadedFileName = mockFile.path;

			// Make multiple rapid calls
			plugin.debouncedSave(mockFile.path, mockState);
			plugin.debouncedSave(mockFile.path, mockState);
			plugin.debouncedSave(mockFile.path, mockState);

			// Should not call writeFileState immediately
			expect(writeFileStateSpy).not.toHaveBeenCalled();

			// Fast-forward time to trigger debounced function
			jest.advanceTimersByTime(500);

			// Should call writeFileState only once
			expect(writeFileStateSpy).toHaveBeenCalledTimes(1);
		});

		it("should cancel debounced save on plugin unload", () => {
			const cancelSpy = jest.spyOn(plugin.debouncedSave, "cancel");

			plugin.onunload();

			expect(cancelSpy).toHaveBeenCalled();
		});
	});

	describe("Vault Event Handlers", () => {
		describe("rename Event Handler", () => {
			it("should handle file rename event", async () => {
				const oldPath = "old/file.md";
				const newFile = TestUtils.createMockFile("new/file.md");
				const mockState = {
					cursor: {
						start: { col: 0, line: 0 },
						end: { col: 5, line: 0 },
					},
				};

				// Setup existing state for old file
				jest.spyOn(plugin, "readFileState").mockResolvedValue(
					mockState
				);
				const writeFileStateSpy = jest
					.spyOn(plugin, "writeFileState")
					.mockResolvedValue();
				jest.spyOn(app.vault.adapter, "exists").mockResolvedValue(true);
				const removeStateSpy = jest
					.spyOn(app.vault.adapter, "remove")
					.mockResolvedValue();

				// Trigger rename event
				app.vault.trigger("rename", newFile, oldPath);

				await jest.runAllTimersAsync();

				expect(writeFileStateSpy).toHaveBeenCalledWith(
					newFile.path,
					mockState
				);
				expect(removeStateSpy).toHaveBeenCalled();
			});

			it("should handle rename when no old state exists", async () => {
				const oldPath = "old/file.md";
				const newFile = TestUtils.createMockFile("new/file.md");

				jest.spyOn(plugin, "readFileState").mockResolvedValue(null);
				const writeFileStateSpy = jest.spyOn(plugin, "writeFileState");

				// Trigger rename event
				app.vault.trigger("rename", newFile, oldPath);

				await jest.runAllTimersAsync();

				expect(writeFileStateSpy).not.toHaveBeenCalled();
			});

			it("should handle rename errors gracefully", async () => {
				const oldPath = "old/file.md";
				const newFile = TestUtils.createMockFile("new/file.md");

				jest.spyOn(plugin, "readFileState").mockRejectedValue(
					new Error("Read error")
				);
				const consoleErrorSpy = jest
					.spyOn(console, "error")
					.mockImplementation(() => {});

				// Trigger rename event
				app.vault.trigger("rename", newFile, oldPath);

				await jest.runAllTimersAsync();

				expect(consoleErrorSpy).toHaveBeenCalledWith(
					"[AES] Error renaming file database:",
					expect.any(Error)
				);

				consoleErrorSpy.mockRestore();
			});
		});

		describe("delete Event Handler", () => {
			it("should handle file delete event", async () => {
				const fileToDelete =
					TestUtils.createMockFile("file-to-delete.md");
				const existsSpy = jest
					.spyOn(app.vault.adapter, "exists")
					.mockResolvedValue(true);
				const removeSpy = jest
					.spyOn(app.vault.adapter, "remove")
					.mockResolvedValue();

				// Trigger delete event
				app.vault.trigger("delete", fileToDelete);

				await jest.runAllTimersAsync();

				expect(existsSpy).toHaveBeenCalled();
				expect(removeSpy).toHaveBeenCalled();
			});

			it("should handle delete when database file doesn't exist", async () => {
				const fileToDelete =
					TestUtils.createMockFile("file-to-delete.md");
				const existsSpy = jest
					.spyOn(app.vault.adapter, "exists")
					.mockResolvedValue(false);
				const removeSpy = jest.spyOn(app.vault.adapter, "remove");

				// Trigger delete event
				app.vault.trigger("delete", fileToDelete);

				await jest.runAllTimersAsync();

				expect(existsSpy).toHaveBeenCalled();
				expect(removeSpy).not.toHaveBeenCalled();
			});

			it("should handle delete errors gracefully", async () => {
				const fileToDelete =
					TestUtils.createMockFile("file-to-delete.md");
				jest.spyOn(app.vault.adapter, "exists").mockRejectedValue(
					new Error("Access error")
				);
				const consoleErrorSpy = jest
					.spyOn(console, "error")
					.mockImplementation(() => {});

				// Trigger delete event
				app.vault.trigger("delete", fileToDelete);

				await jest.runAllTimersAsync();

				expect(consoleErrorSpy).toHaveBeenCalledWith(
					"[AES] Error deleting file database:",
					expect.any(Error)
				);

				consoleErrorSpy.mockRestore();
			});
		});
	});

	describe("checkTemporaryStateChanged", () => {
		it("should use requestAnimationFrame for state checking", () => {
			// Setup plugin state to allow performStateCheck to run
			plugin.lastLoadedFileName = mockFile.path;
			plugin.loadingFile = false;
			plugin.restorationPromise = null;

			const performStateCheckSpy = jest.spyOn(
				plugin,
				"performStateCheck"
			);
			const requestAnimationFrameSpy = jest
				.spyOn(window, "requestAnimationFrame")
				.mockImplementation(cb => {
					// Immediately call the callback to simulate requestAnimationFrame
					cb(0);
					return 0;
				});

			plugin.checkTemporaryStateChanged();

			expect(requestAnimationFrameSpy).toHaveBeenCalled();
			expect(performStateCheckSpy).toHaveBeenCalled();

			requestAnimationFrameSpy.mockRestore();
		});

		it("should wait for restoration promise before state check", async () => {
			const performStateCheckSpy = jest.spyOn(
				plugin,
				"performStateCheck"
			);

			// Set up a restoration promise
			plugin.restorationPromise = new Promise(resolve => {
				setTimeout(resolve, 100);
			});

			const requestAnimationFrameSpy = jest
				.spyOn(window, "requestAnimationFrame")
				.mockImplementation(cb => {
					cb(0);
					return 0;
				});

			plugin.checkTemporaryStateChanged();

			// Should not call performStateCheck immediately
			expect(performStateCheckSpy).not.toHaveBeenCalled();

			// Fast-forward time to resolve restoration promise
			jest.advanceTimersByTime(100);
			await jest.runAllTimersAsync();

			expect(performStateCheckSpy).toHaveBeenCalled();

			requestAnimationFrameSpy.mockRestore();
		});
	});

	describe("Event Handler Integration", () => {
		it("should handle complete file-open to state-save workflow", async () => {
			const mockState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 0 },
				},
				scroll: 100,
			};

			// Mock methods
			jest.spyOn(plugin, "readFileState").mockResolvedValue(mockState);
			const setTemporaryStateSpy = jest.spyOn(
				plugin,
				"setTemporaryState"
			);
			jest.spyOn(plugin, "getTemporaryState").mockReturnValue(mockState);
			jest.spyOn(plugin, "saveTemporaryState").mockResolvedValue();

			// Trigger file-open
			app.workspace.trigger("file-open", mockFile);
			await jest.runAllTimersAsync();

			// Trigger layout-change to complete file opening
			app.workspace.trigger("layout-change");
			await jest.runAllTimersAsync();

			expect(setTemporaryStateSpy).toHaveBeenCalledWith(mockState);

			// Now trigger editor-change to save state
			app.workspace.trigger("editor-change");

			// Fast-forward through requestAnimationFrame and state checking
			jest.advanceTimersByTime(0);
		});

		it("should handle rapid event firing without excessive saves", () => {
			const mockState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 0 },
				},
			};

			// Setup plugin state to allow state checking
			plugin.lastLoadedFileName = mockFile.path;
			plugin.lastTemporaryState = null; // This ensures state comparison will trigger save
			plugin.loadingFile = false;
			plugin.restorationPromise = null;

			jest.spyOn(plugin, "getTemporaryState").mockReturnValue(mockState);
			const saveTemporaryStateSpy = jest
				.spyOn(plugin, "saveTemporaryState")
				.mockResolvedValue();

			// Mock TemporaryStatesSame to return false so save is triggered
			jest.spyOn(plugin, "TemporaryStatesSame").mockReturnValue(false);

			// Mock requestAnimationFrame to execute immediately
			const requestAnimationFrameSpy = jest
				.spyOn(window, "requestAnimationFrame")
				.mockImplementation(cb => {
					cb(0);
					return 0;
				});

			// Fire multiple rapid events
			app.workspace.trigger("editor-change");
			app.workspace.trigger("editor-change");
			app.workspace.trigger("layout-change");
			app.workspace.trigger("active-leaf-change");

			// Should call save at least once due to debouncing
			expect(saveTemporaryStateSpy).toHaveBeenCalled();

			requestAnimationFrameSpy.mockRestore();
		});
	});
});
