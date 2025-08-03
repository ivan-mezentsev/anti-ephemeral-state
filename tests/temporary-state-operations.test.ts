/**
 * Tests for temporary state operations in AntiEphemeralState plugin
 * Coverage: getTemporaryState, setTemporaryState methods
 * Requirements: 1.3, 6.2, 6.4
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
	MarkdownView,
	Editor,
	TFile,
	MockWorkspace,
} from "./__mocks__/obsidian";

// Type-safe plugin constructor helper
function createPlugin(app: App, manifest: MockManifest): AntiEphemeralState {
	// Type assertion is necessary here due to mock/real type mismatch
	return new AntiEphemeralState(app as never, manifest as never);
}

describe("AntiEphemeralState Temporary State Operations", () => {
	let plugin: AntiEphemeralState;
	let app: App;
	let manifest: MockManifest;
	let mockVault: MockVault;
	let mockWorkspace: MockWorkspace;
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
		mockVault = app.vault as MockVault;
		mockWorkspace = app.workspace as MockWorkspace;

		// Create mock view and editor
		mockView = new MarkdownView(new TFile("test.md"));
		mockEditor = new Editor();

		// Set up workspace to return our mock view
		jest.spyOn(mockWorkspace, "getActiveViewOfType").mockReturnValue(
			mockView
		);

		// Initialize plugin settings
		plugin.DEFAULT_SETTINGS = {
			dbDir: "/test/.obsidian/plugins/anti-ephemeral-state/db",
		};
		plugin.settings = { ...plugin.DEFAULT_SETTINGS };

		// Clear console mocks
		jest.clearAllMocks();
	});

	afterEach(() => {
		// Clean up mock file system
		if (mockVault?.adapter) {
			mockVault.adapter.reset();
		}
		jest.restoreAllMocks();
	});

	describe("getTemporaryState", () => {
		describe("cursor position extraction", () => {
			beforeEach(() => {
				// Mock getEditor to return our mock editor
				jest.spyOn(
					plugin,
					"getEditor" as keyof AntiEphemeralState
				).mockReturnValue(mockEditor);
			});

			it("should extract cursor position when editor has selection", () => {
				// Mock cursor positions
				jest.spyOn(mockEditor, "getCursor")
					.mockReturnValueOnce({ line: 2, ch: 5 }) // anchor
					.mockReturnValueOnce({ line: 3, ch: 10 }); // head

				const state = plugin.getTemporaryState();

				expect(state.cursor).toBeDefined();
				expect(state.cursor).toEqual({
					start: { col: 5, line: 2 },
					end: { col: 10, line: 3 },
				});
			});

			it("should extract cursor position when editor has single cursor", () => {
				// Mock single cursor position
				const cursorPos = { line: 1, ch: 3 };
				jest.spyOn(mockEditor, "getCursor").mockReturnValue(cursorPos);

				const state = plugin.getTemporaryState();

				expect(state.cursor).toBeDefined();
				expect(state.cursor).toEqual({
					start: { col: 3, line: 1 },
					end: { col: 3, line: 1 },
				});
			});

			it("should handle cursor at document start", () => {
				// Mock cursor at beginning
				const cursorPos = { line: 0, ch: 0 };
				jest.spyOn(mockEditor, "getCursor").mockReturnValue(cursorPos);

				const state = plugin.getTemporaryState();

				expect(state.cursor).toBeDefined();
				expect(state.cursor).toEqual({
					start: { col: 0, line: 0 },
					end: { col: 0, line: 0 },
				});
			});

			it("should handle large cursor positions", () => {
				// Mock large cursor positions
				jest.spyOn(mockEditor, "getCursor")
					.mockReturnValueOnce({ line: 1000, ch: 500 }) // anchor
					.mockReturnValueOnce({ line: 1005, ch: 750 }); // head

				const state = plugin.getTemporaryState();

				expect(state.cursor).toBeDefined();
				expect(state.cursor).toEqual({
					start: { col: 500, line: 1000 },
					end: { col: 750, line: 1005 },
				});
			});

			it("should handle editor with null cursor", () => {
				// Mock editor to return null cursors
				jest.spyOn(mockEditor, "getCursor").mockReturnValue(
					null as never
				);

				const state = plugin.getTemporaryState();

				expect(state.cursor).toBeUndefined();
			});

			it("should handle editor with undefined cursor", () => {
				// Mock editor to return undefined cursors
				jest.spyOn(mockEditor, "getCursor").mockReturnValue(
					undefined as never
				);

				const state = plugin.getTemporaryState();

				expect(state.cursor).toBeUndefined();
			});
		});

		describe("scroll position extraction", () => {
			beforeEach(() => {
				// Mock getEditor to return our mock editor
				jest.spyOn(
					plugin,
					"getEditor" as keyof AntiEphemeralState
				).mockReturnValue(mockEditor);
			});

			it("should extract scroll position from view mode", () => {
				// Mock view with currentMode
				const mockCurrentMode = {
					getScroll: jest.fn().mockReturnValue(150.5),
				};
				Object.assign(mockView, { currentMode: mockCurrentMode });

				const state = plugin.getTemporaryState();

				expect(state.scroll).toBe(150.5);
			});

			it("should handle zero scroll position", () => {
				// Mock view with zero scroll
				const mockCurrentMode = {
					getScroll: jest.fn().mockReturnValue(0),
				};
				Object.assign(mockView, { currentMode: mockCurrentMode });

				const state = plugin.getTemporaryState();

				expect(state.scroll).toBe(0);
			});

			it("should handle large scroll positions", () => {
				// Mock view with large scroll value
				const mockCurrentMode = {
					getScroll: jest.fn().mockReturnValue(9999.9999),
				};
				Object.assign(mockView, { currentMode: mockCurrentMode });

				const state = plugin.getTemporaryState();

				expect(state.scroll).toBe(9999.9999);
			});

			it("should round scroll position to 4 decimal places", () => {
				// Mock view with precise scroll value
				const mockCurrentMode = {
					getScroll: jest.fn().mockReturnValue(123.123456789),
				};
				Object.assign(mockView, { currentMode: mockCurrentMode });

				const state = plugin.getTemporaryState();

				expect(state.scroll).toBe(123.1235); // Rounded to 4 decimal places
			});

			it("should fallback to editor scroll info when view mode fails", () => {
				// Mock view mode to return undefined
				const mockCurrentMode = {
					getScroll: jest.fn().mockReturnValue(undefined),
				};
				Object.assign(mockView, { currentMode: mockCurrentMode });

				// Mock editor scroll info
				jest.spyOn(mockEditor, "getScrollInfo").mockReturnValue({
					top: 200.25,
					left: 0,
				});

				const state = plugin.getTemporaryState();

				expect(state.scroll).toBe(200.25);
			});

			it("should handle NaN scroll values gracefully", () => {
				// Mock view mode to return NaN
				const mockCurrentMode = {
					getScroll: jest.fn().mockReturnValue(NaN),
				};
				Object.assign(mockView, { currentMode: mockCurrentMode });

				const state = plugin.getTemporaryState();

				expect(state.scroll).toBeUndefined();
			});

			it("should handle null scroll values gracefully", () => {
				// Mock view mode to return null
				const mockCurrentMode = {
					getScroll: jest.fn().mockReturnValue(null),
				};
				Object.assign(mockView, { currentMode: mockCurrentMode });

				const state = plugin.getTemporaryState();

				expect(state.scroll).toBeUndefined();
			});

			it("should handle view with null currentMode", () => {
				// Remove currentMode
				Object.assign(mockView, { currentMode: null });

				// Mock editor scroll info as fallback
				jest.spyOn(mockEditor, "getScrollInfo").mockReturnValue({
					top: 100,
					left: 0,
				});

				const state = plugin.getTemporaryState();

				// Should fallback to editor scroll
				expect(state.scroll).toBe(100);
			});
		});

		describe("viewState extraction", () => {
			beforeEach(() => {
				// Mock getEditor to return our mock editor
				jest.spyOn(
					plugin,
					"getEditor" as keyof AntiEphemeralState
				).mockReturnValue(mockEditor);
			});

			it("should extract complete view state from active view", () => {
				// Mock view state
				const expectedViewState = {
					type: "markdown",
					state: { mode: "source", source: true },
					file: "test.md",
				};
				jest.spyOn(mockView, "getState").mockReturnValue(
					expectedViewState
				);

				const state = plugin.getTemporaryState();

				expect(state.viewState).toBeDefined();
				expect(state.viewState).toEqual({
					...expectedViewState,
					type: "markdown",
				});
			});

			it("should include view type in viewState", () => {
				const state = plugin.getTemporaryState();

				expect(state.viewState).toBeDefined();
				expect(state.viewState?.type).toBe("markdown");
			});

			it("should handle complex view state structures", () => {
				// Mock complex view state
				const complexViewState = {
					type: "markdown",
					state: {
						mode: "preview",
						source: false,
						backlinks: true,
						eState: {
							cursor: { from: 0, to: 10 },
							scroll: 50,
						},
					},
					file: "complex-test.md",
					active: true,
				};
				jest.spyOn(mockView, "getState").mockReturnValue(
					complexViewState
				);

				const state = plugin.getTemporaryState();

				expect(state.viewState).toEqual({
					...complexViewState,
					type: "markdown",
				});
			});
		});

		describe("handling missing or invalid data", () => {
			it("should return empty state when no active view", () => {
				// Mock workspace to return null
				jest.spyOn(
					mockWorkspace,
					"getActiveViewOfType"
				).mockReturnValue(null);

				const state = plugin.getTemporaryState();

				expect(state).toEqual({});
			});

			it("should handle missing editor gracefully", () => {
				// Mock getEditor to return null
				jest.spyOn(
					plugin,
					"getEditor" as keyof AntiEphemeralState
				).mockReturnValue(null);

				// Mock view with currentMode for scroll
				const mockCurrentMode = {
					getScroll: jest.fn().mockReturnValue(100),
				};
				Object.assign(mockView, { currentMode: mockCurrentMode });

				const state = plugin.getTemporaryState();

				// Should still have viewState and scroll, but no cursor
				expect(state.viewState).toBeDefined();
				expect(state.scroll).toBeDefined();
				expect(state.cursor).toBeUndefined();
			});
		});

		describe("complete state extraction", () => {
			beforeEach(() => {
				// Mock getEditor to return our mock editor
				jest.spyOn(
					plugin,
					"getEditor" as keyof AntiEphemeralState
				).mockReturnValue(mockEditor);
			});

			it("should extract all components when available", () => {
				// Mock cursor
				jest.spyOn(mockEditor, "getCursor").mockReturnValue({
					line: 5,
					ch: 10,
				});

				// Mock scroll
				const mockCurrentMode = {
					getScroll: jest.fn().mockReturnValue(300.5),
				};
				Object.assign(mockView, { currentMode: mockCurrentMode });

				// Mock view state
				const viewState = {
					type: "markdown",
					state: { mode: "source" },
					file: "complete-test.md",
				};
				jest.spyOn(mockView, "getState").mockReturnValue(viewState);

				const state = plugin.getTemporaryState();

				expect(state).toEqual({
					cursor: {
						start: { col: 10, line: 5 },
						end: { col: 10, line: 5 },
					},
					scroll: 300.5,
					viewState: {
						...viewState,
						type: "markdown",
					},
				});
			});

			it("should handle partial state extraction", () => {
				// Mock cursor
				jest.spyOn(mockEditor, "getCursor").mockReturnValue({
					line: 2,
					ch: 8,
				});

				// Mock view mode to return undefined for scroll
				const mockCurrentMode = {
					getScroll: jest.fn().mockReturnValue(undefined),
				};
				Object.assign(mockView, { currentMode: mockCurrentMode });

				// Mock editor scroll info to return undefined top
				jest.spyOn(mockEditor, "getScrollInfo").mockReturnValue({
					top: undefined as never,
					left: 0,
				});

				const state = plugin.getTemporaryState();

				expect(state.cursor).toBeDefined();
				expect(state.viewState).toBeDefined();
				expect(state.scroll).toBeUndefined();
			});
		});
	});

	describe("setTemporaryState", () => {
		beforeEach(() => {
			// Mock getEditor to return our mock editor
			jest.spyOn(
				plugin,
				"getEditor" as keyof AntiEphemeralState
			).mockReturnValue(mockEditor);
		});

		describe("cursor position restoration", () => {
			it("should restore single cursor position", async () => {
				const state = {
					cursor: {
						start: { col: 5, line: 2 },
						end: { col: 5, line: 2 },
					},
				};

				const setSelectionSpy = jest.spyOn(mockEditor, "setSelection");

				plugin.setTemporaryState(state);

				// Wait for layout ready callback
				await new Promise(resolve => setTimeout(resolve, 10));

				// Verify setSelection was called correctly
				expect(setSelectionSpy).toHaveBeenCalledWith(
					{ ch: 5, line: 2 },
					{ ch: 5, line: 2 }
				);
			});

			it("should restore text selection", async () => {
				const state = {
					cursor: {
						start: { col: 0, line: 1 },
						end: { col: 10, line: 3 },
					},
				};

				const setSelectionSpy = jest.spyOn(mockEditor, "setSelection");

				plugin.setTemporaryState(state);

				// Wait for layout ready callback
				await new Promise(resolve => setTimeout(resolve, 10));

				// Verify selection was set correctly
				expect(setSelectionSpy).toHaveBeenCalledWith(
					{ ch: 0, line: 1 },
					{ ch: 10, line: 3 }
				);
			});

			it("should handle cursor at document boundaries", async () => {
				const state = {
					cursor: {
						start: { col: 0, line: 0 },
						end: { col: 0, line: 0 },
					},
				};

				const setSelectionSpy = jest.spyOn(mockEditor, "setSelection");

				plugin.setTemporaryState(state);

				// Wait for layout ready callback
				await new Promise(resolve => setTimeout(resolve, 10));

				// Verify cursor was set to beginning
				expect(setSelectionSpy).toHaveBeenCalledWith(
					{ ch: 0, line: 0 },
					{ ch: 0, line: 0 }
				);
			});

			it("should handle large cursor positions", async () => {
				const state = {
					cursor: {
						start: { col: 500, line: 1000 },
						end: { col: 750, line: 1005 },
					},
				};

				const setSelectionSpy = jest.spyOn(mockEditor, "setSelection");

				plugin.setTemporaryState(state);

				// Wait for layout ready callback
				await new Promise(resolve => setTimeout(resolve, 10));

				// Verify large positions were set correctly
				expect(setSelectionSpy).toHaveBeenCalledWith(
					{ ch: 500, line: 1000 },
					{ ch: 750, line: 1005 }
				);
			});

			it("should skip cursor restoration when no editor available", async () => {
				const state = {
					cursor: {
						start: { col: 5, line: 2 },
						end: { col: 5, line: 2 },
					},
				};

				// Mock getEditor to return null
				jest.spyOn(
					plugin,
					"getEditor" as keyof AntiEphemeralState
				).mockReturnValue(null);

				// Should not throw error
				expect(() => plugin.setTemporaryState(state)).not.toThrow();
			});
		});

		describe("scroll position restoration", () => {
			it("should restore scroll position", async () => {
				const state = {
					scroll: 150.5,
				};

				// Mock setEphemeralState
				const setEphemeralStateSpy = jest
					.spyOn(mockView, "setEphemeralState")
					.mockImplementation();

				plugin.setTemporaryState(state);

				// Wait for layout ready and requestAnimationFrame
				await new Promise(resolve => setTimeout(resolve, 20));

				// Verify setEphemeralState was called with the state
				expect(setEphemeralStateSpy).toHaveBeenCalledWith(state);
			});

			it("should handle zero scroll position", async () => {
				const state = {
					scroll: 0,
				};

				const setEphemeralStateSpy = jest
					.spyOn(mockView, "setEphemeralState")
					.mockImplementation();

				plugin.setTemporaryState(state);

				// Wait for layout ready and requestAnimationFrame
				await new Promise(resolve => setTimeout(resolve, 20));

				expect(setEphemeralStateSpy).toHaveBeenCalledWith(state);
			});

			it("should handle large scroll positions", async () => {
				const state = {
					scroll: 9999.9999,
				};

				const setEphemeralStateSpy = jest
					.spyOn(mockView, "setEphemeralState")
					.mockImplementation();

				plugin.setTemporaryState(state);

				// Wait for layout ready and requestAnimationFrame
				await new Promise(resolve => setTimeout(resolve, 20));

				expect(setEphemeralStateSpy).toHaveBeenCalledWith(state);
			});

			it("should skip scroll restoration when no view available", async () => {
				const state = {
					scroll: 100,
				};

				// Mock workspace to return null
				jest.spyOn(
					mockWorkspace,
					"getActiveViewOfType"
				).mockReturnValue(null);

				// Should not throw error
				expect(() => plugin.setTemporaryState(state)).not.toThrow();
			});

			it("should skip scroll restoration when scroll is undefined", async () => {
				const state = {
					cursor: {
						start: { col: 0, line: 0 },
						end: { col: 0, line: 0 },
					},
				};

				const setEphemeralStateSpy = jest
					.spyOn(mockView, "setEphemeralState")
					.mockImplementation();

				plugin.setTemporaryState(state);

				// Wait for layout ready and requestAnimationFrame
				await new Promise(resolve => setTimeout(resolve, 20));

				// setEphemeralState should not be called when no scroll
				expect(setEphemeralStateSpy).not.toHaveBeenCalled();
			});
		});

		describe("viewState restoration", () => {
			it("should restore view state", () => {
				const state = {
					viewState: {
						type: "markdown",
						state: { mode: "preview" },
						file: "restored-test.md",
					},
				};

				const setStateSpy = jest.spyOn(mockView, "setState");

				plugin.setTemporaryState(state);

				// Verify setState was called with correct parameters
				expect(setStateSpy).toHaveBeenCalledWith(state.viewState, {
					history: false,
				});
			});

			it("should handle complex view state", () => {
				const state = {
					viewState: {
						type: "markdown",
						state: {
							mode: "source",
							source: true,
							backlinks: false,
							eState: {
								cursor: { from: 10, to: 20 },
								scroll: 75,
							},
						},
						file: "complex-restored.md",
						active: true,
					},
				};

				const setStateSpy = jest.spyOn(mockView, "setState");

				plugin.setTemporaryState(state);

				expect(setStateSpy).toHaveBeenCalledWith(state.viewState, {
					history: false,
				});
			});

			it("should skip viewState restoration when no view available", () => {
				const state = {
					viewState: {
						type: "markdown",
						state: { mode: "source" },
						file: "test.md",
					},
				};

				// Mock workspace to return null
				jest.spyOn(
					mockWorkspace,
					"getActiveViewOfType"
				).mockReturnValue(null);

				// Should not throw error
				expect(() => plugin.setTemporaryState(state)).not.toThrow();
			});

			it("should skip viewState restoration when viewState is undefined", () => {
				const state = {
					cursor: {
						start: { col: 0, line: 0 },
						end: { col: 0, line: 0 },
					},
				};

				const setStateSpy = jest.spyOn(mockView, "setState");

				plugin.setTemporaryState(state);

				// setState should not be called when no viewState
				expect(setStateSpy).not.toHaveBeenCalled();
			});
		});

		describe("handling missing or invalid data", () => {
			it("should handle empty state object", async () => {
				const state = {};

				// Should not throw error
				expect(() => plugin.setTemporaryState(state)).not.toThrow();

				// Wait for any async operations
				await new Promise(resolve => setTimeout(resolve, 20));
			});

			it("should handle null state", () => {
				const state = null;

				// Current implementation will throw error when accessing state.viewState
				expect(() => plugin.setTemporaryState(state)).toThrow();
			});

			it("should handle undefined state", () => {
				const state = undefined;

				// Current implementation will throw error when accessing state.viewState
				expect(() => plugin.setTemporaryState(state)).toThrow();
			});

			it("should handle state with valid cursor structure but invalid values", async () => {
				const state = {
					cursor: {
						start: { col: -1, line: -1 },
						end: { col: NaN, line: Infinity },
					},
				};

				const setSelectionSpy = jest.spyOn(mockEditor, "setSelection");

				// Should not throw error
				expect(() => plugin.setTemporaryState(state)).not.toThrow();

				// Wait for layout ready callback
				await new Promise(resolve => setTimeout(resolve, 20));

				// Verify cursor was set (even with invalid values)
				expect(setSelectionSpy).toHaveBeenCalledWith(
					{ ch: -1, line: -1 },
					{ ch: NaN, line: Infinity }
				);
			});

			it("should handle state with complete cursor structure", async () => {
				const state = {
					cursor: {
						start: { col: 5, line: 2 },
						end: { col: 8, line: 3 },
					},
				};

				const setSelectionSpy = jest.spyOn(mockEditor, "setSelection");

				// Should not throw error
				expect(() => plugin.setTemporaryState(state)).not.toThrow();

				// Wait for layout ready callback
				await new Promise(resolve => setTimeout(resolve, 20));

				// Verify cursor was set correctly
				expect(setSelectionSpy).toHaveBeenCalledWith(
					{ ch: 5, line: 2 },
					{ ch: 8, line: 3 }
				);
			});

			it("should handle state with invalid scroll data", async () => {
				const state = {
					scroll: "invalid" as never,
				};

				const setEphemeralStateSpy = jest
					.spyOn(mockView, "setEphemeralState")
					.mockImplementation();

				plugin.setTemporaryState(state);

				// Wait for layout ready and requestAnimationFrame
				await new Promise(resolve => setTimeout(resolve, 20));

				// Should still call setEphemeralState even with invalid scroll
				expect(setEphemeralStateSpy).toHaveBeenCalledWith(state);
			});

			it("should handle state with invalid viewState data", () => {
				const state = {
					viewState: "invalid" as never,
				};

				const setStateSpy = jest.spyOn(mockView, "setState");

				plugin.setTemporaryState(state);

				// Should still call setState even with invalid viewState
				expect(setStateSpy).toHaveBeenCalledWith(state.viewState, {
					history: false,
				});
			});
		});

		describe("complete state restoration", () => {
			it("should restore all components when available", async () => {
				const state = {
					cursor: {
						start: { col: 10, line: 5 },
						end: { col: 15, line: 7 },
					},
					scroll: 250.75,
					viewState: {
						type: "markdown",
						state: { mode: "source" },
						file: "complete-restore.md",
					},
				};

				const setStateSpy = jest.spyOn(mockView, "setState");
				const setEphemeralStateSpy = jest
					.spyOn(mockView, "setEphemeralState")
					.mockImplementation();
				const setSelectionSpy = jest.spyOn(mockEditor, "setSelection");

				plugin.setTemporaryState(state);

				// Verify viewState restoration (immediate)
				expect(setStateSpy).toHaveBeenCalledWith(state.viewState, {
					history: false,
				});

				// Wait for layout ready and requestAnimationFrame
				await new Promise(resolve => setTimeout(resolve, 20));

				// Verify cursor restoration
				expect(setSelectionSpy).toHaveBeenCalledWith(
					{ ch: 10, line: 5 },
					{ ch: 15, line: 7 }
				);

				// Verify scroll restoration
				expect(setEphemeralStateSpy).toHaveBeenCalledWith(state);
			});

			it("should handle partial state restoration gracefully", async () => {
				const state = {
					cursor: {
						start: { col: 5, line: 2 },
						end: { col: 5, line: 2 },
					},
					// No scroll or viewState
				};

				const setStateSpy = jest.spyOn(mockView, "setState");
				const setEphemeralStateSpy = jest
					.spyOn(mockView, "setEphemeralState")
					.mockImplementation();
				const setSelectionSpy = jest.spyOn(mockEditor, "setSelection");

				plugin.setTemporaryState(state);

				// Wait for layout ready and requestAnimationFrame
				await new Promise(resolve => setTimeout(resolve, 20));

				// Only cursor should be restored
				expect(setSelectionSpy).toHaveBeenCalledWith(
					{ ch: 5, line: 2 },
					{ ch: 5, line: 2 }
				);
				expect(setStateSpy).not.toHaveBeenCalled();
				expect(setEphemeralStateSpy).not.toHaveBeenCalled();
			});
		});
	});

	describe("integration scenarios", () => {
		beforeEach(() => {
			// Mock getEditor to return our mock editor
			jest.spyOn(
				plugin,
				"getEditor" as keyof AntiEphemeralState
			).mockReturnValue(mockEditor);
		});

		it("should maintain state consistency in get/set cycle", async () => {
			// Set up initial state
			const initialCursor = { line: 3, ch: 8 };
			const initialScroll = 175.25;
			const initialViewState = {
				type: "markdown",
				state: { mode: "source" },
				file: "cycle-test.md",
			};

			// Mock initial state
			jest.spyOn(mockEditor, "getCursor").mockReturnValue(initialCursor);
			const mockCurrentMode = {
				getScroll: jest.fn().mockReturnValue(initialScroll),
			};
			Object.assign(mockView, { currentMode: mockCurrentMode });
			jest.spyOn(mockView, "getState").mockReturnValue(initialViewState);

			// Get state
			const retrievedState = plugin.getTemporaryState();

			// Verify state was retrieved correctly
			expect(retrievedState.cursor).toEqual({
				start: { col: 8, line: 3 },
				end: { col: 8, line: 3 },
			});
			expect(retrievedState.scroll).toBe(175.25);

			// Mock setSelection for restoration
			const setSelectionSpy = jest.spyOn(mockEditor, "setSelection");

			// Restore state
			plugin.setTemporaryState(retrievedState);

			// Wait for restoration
			await new Promise(resolve => setTimeout(resolve, 20));

			// Verify state was restored correctly
			expect(setSelectionSpy).toHaveBeenCalledWith(
				{ ch: 8, line: 3 },
				{ ch: 8, line: 3 }
			);
		});

		it("should handle rapid get/set operations", async () => {
			// Simulate rapid state changes
			const states = [
				{
					cursor: {
						start: { col: 0, line: 0 },
						end: { col: 0, line: 0 },
					},
					scroll: 0,
				},
				{
					cursor: {
						start: { col: 5, line: 1 },
						end: { col: 10, line: 1 },
					},
					scroll: 50,
				},
				{
					cursor: {
						start: { col: 0, line: 2 },
						end: { col: 0, line: 2 },
					},
					scroll: 100,
				},
			];

			const setSelectionSpy = jest.spyOn(mockEditor, "setSelection");
			const setEphemeralStateSpy = jest
				.spyOn(mockView, "setEphemeralState")
				.mockImplementation();

			// Apply states rapidly
			for (const state of states) {
				plugin.setTemporaryState(state);
			}

			// Wait for all operations to complete
			await new Promise(resolve => setTimeout(resolve, 50));

			// Should end up with the last state
			const finalState = states[states.length - 1];
			expect(setSelectionSpy).toHaveBeenLastCalledWith(
				{
					ch: finalState.cursor.start.col,
					line: finalState.cursor.start.line,
				},
				{
					ch: finalState.cursor.end.col,
					line: finalState.cursor.end.line,
				}
			);
			expect(setEphemeralStateSpy).toHaveBeenLastCalledWith(finalState);
		});
	});
});
