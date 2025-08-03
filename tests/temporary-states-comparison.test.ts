/**
 * Tests for temporary state comparison functionality in AntiEphemeralState plugin
 * Coverage: TemporaryStatesSame method
 * Requirements: 1.3, 4.2, 6.4
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import AntiEphemeralState from "../main";
import { App, TestUtils, MockManifest } from "./__mocks__/obsidian";

// Type-safe plugin constructor helper
function createPlugin(app: App, manifest: MockManifest): AntiEphemeralState {
	return new AntiEphemeralState(app as never, manifest as never);
}

// Helper to create test states
interface TestTemporaryState {
	cursor?: {
		start: { col: number; line: number };
		end: { col: number; line: number };
	};
	scroll?: number;
	viewState?: Record<string, unknown>;
}

describe("AntiEphemeralState TemporaryStatesSame", () => {
	let plugin: AntiEphemeralState;
	let app: App;
	let manifest: MockManifest;

	beforeEach(async () => {
		// Create test app with standard configDir
		app = TestUtils.createMockApp("/test/.obsidian");
		manifest = TestUtils.createMockManifest({
			id: "anti-ephemeral-state",
			name: "Anti-Ephemeral State",
			version: "1.0.0",
		});

		plugin = createPlugin(app, manifest);

		// Initialize plugin settings
		plugin.DEFAULT_SETTINGS = {
			dbDir: "/test/.obsidian/plugins/anti-ephemeral-state/db",
		};
		plugin.settings = { ...plugin.DEFAULT_SETTINGS };

		// Clear console mocks
		jest.clearAllMocks();
	});

	describe("null and empty state handling", () => {
		it("should return true when both states are null", () => {
			const result = plugin.TemporaryStatesSame(null, null);
			expect(result).toBe(true);
		});

		it("should return false when left state is null and right is not", () => {
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 0, line: 0 },
				},
			};
			const result = plugin.TemporaryStatesSame(null, rightState);
			expect(result).toBe(false);
		});

		it("should return false when right state is null and left is not", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 0, line: 0 },
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, null);
			expect(result).toBe(false);
		});

		it("should return true when both states are empty objects", () => {
			const leftState: TestTemporaryState = {};
			const rightState: TestTemporaryState = {};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should return true when both states have no meaningful content", () => {
			const leftState: TestTemporaryState = {
				cursor: undefined,
				scroll: undefined,
				viewState: undefined,
			};
			const rightState: TestTemporaryState = {};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should return false when one state is empty and other has content", () => {
			const leftState: TestTemporaryState = {};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 0, line: 0 },
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should handle states with only undefined properties as empty", () => {
			const leftState: TestTemporaryState = {
				cursor: undefined,
				scroll: undefined,
				viewState: undefined,
			};
			const rightState: TestTemporaryState = {
				cursor: undefined,
				scroll: undefined,
				viewState: undefined,
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});
	});

	describe("cursor comparison", () => {
		it("should return true for identical cursor positions", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 10, line: 3 },
				},
			};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 10, line: 3 },
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should return true for identical single cursor positions", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 8, line: 1 },
					end: { col: 8, line: 1 },
				},
			};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 8, line: 1 },
					end: { col: 8, line: 1 },
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should return false for different start column positions", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 10, line: 3 },
				},
			};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 6, line: 2 },
					end: { col: 10, line: 3 },
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should return false for different start line positions", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 10, line: 3 },
				},
			};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 3 },
					end: { col: 10, line: 3 },
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should return false for different end column positions", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 10, line: 3 },
				},
			};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 11, line: 3 },
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should return false for different end line positions", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 10, line: 3 },
				},
			};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 10, line: 4 },
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should return false when one state has cursor and other does not", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 0, line: 0 },
				},
			};
			const rightState: TestTemporaryState = {};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should return true when both states have no cursor", () => {
			const leftState: TestTemporaryState = { scroll: 100 };
			const rightState: TestTemporaryState = { scroll: 100 };
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should handle cursor at document boundaries", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 0, line: 0 },
				},
			};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 0, line: 0 },
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should handle large cursor positions", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 1000, line: 5000 },
					end: { col: 1500, line: 5500 },
				},
			};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 1000, line: 5000 },
					end: { col: 1500, line: 5500 },
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should detect minor differences in large cursor positions", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 1000, line: 5000 },
					end: { col: 1500, line: 5500 },
				},
			};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 1000, line: 5000 },
					end: { col: 1500, line: 5501 },
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});
	});

	describe("scroll comparison", () => {
		it("should return true for identical scroll positions", () => {
			const leftState: TestTemporaryState = { scroll: 150.5 };
			const rightState: TestTemporaryState = { scroll: 150.5 };
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should return true for zero scroll positions", () => {
			const leftState: TestTemporaryState = { scroll: 0 };
			const rightState: TestTemporaryState = { scroll: 0 };
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should return false for different scroll positions", () => {
			const leftState: TestTemporaryState = { scroll: 150.5 };
			const rightState: TestTemporaryState = { scroll: 150.6 };
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should return false when one state has scroll and other does not", () => {
			const leftState: TestTemporaryState = { scroll: 100 };
			const rightState: TestTemporaryState = {};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should return true when both states have no scroll", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 0, line: 0 },
				},
			};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 0, line: 0 },
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should handle large scroll values", () => {
			const leftState: TestTemporaryState = { scroll: 9999.9999 };
			const rightState: TestTemporaryState = { scroll: 9999.9999 };
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should detect minor differences in large scroll values", () => {
			const leftState: TestTemporaryState = { scroll: 9999.9999 };
			const rightState: TestTemporaryState = { scroll: 9999.9998 };
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should handle negative scroll values", () => {
			const leftState: TestTemporaryState = { scroll: -10.5 };
			const rightState: TestTemporaryState = { scroll: -10.5 };
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should detect differences in negative scroll values", () => {
			const leftState: TestTemporaryState = { scroll: -10.5 };
			const rightState: TestTemporaryState = { scroll: -10.4 };
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should handle very small scroll differences", () => {
			const leftState: TestTemporaryState = { scroll: 100.0001 };
			const rightState: TestTemporaryState = { scroll: 100.0002 };
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});
	});

	describe("viewState comparison", () => {
		it("should return true for identical simple viewStates", () => {
			const viewState = { type: "markdown", file: "test.md" };
			const leftState: TestTemporaryState = { viewState };
			const rightState: TestTemporaryState = { viewState };
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should return true for identical complex viewStates", () => {
			const viewState = {
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
				file: "complex-test.md",
				active: true,
			};
			const leftState: TestTemporaryState = { viewState };
			const rightState: TestTemporaryState = { viewState };
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should return false for different viewState types", () => {
			const leftState: TestTemporaryState = {
				viewState: { type: "markdown", file: "test.md" },
			};
			const rightState: TestTemporaryState = {
				viewState: { type: "canvas", file: "test.md" },
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should return false for different viewState files", () => {
			const leftState: TestTemporaryState = {
				viewState: { type: "markdown", file: "test1.md" },
			};
			const rightState: TestTemporaryState = {
				viewState: { type: "markdown", file: "test2.md" },
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should return false for different nested viewState properties", () => {
			const leftState: TestTemporaryState = {
				viewState: {
					type: "markdown",
					state: { mode: "source", source: true },
					file: "test.md",
				},
			};
			const rightState: TestTemporaryState = {
				viewState: {
					type: "markdown",
					state: { mode: "preview", source: false },
					file: "test.md",
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should return false when one state has viewState and other does not", () => {
			const leftState: TestTemporaryState = {
				viewState: { type: "markdown", file: "test.md" },
			};
			const rightState: TestTemporaryState = {};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should return true when both states have no viewState", () => {
			const leftState: TestTemporaryState = { scroll: 100 };
			const rightState: TestTemporaryState = { scroll: 100 };
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should handle undefined viewStates as equal", () => {
			const leftState: TestTemporaryState = { viewState: undefined };
			const rightState: TestTemporaryState = { viewState: undefined };
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should handle null viewStates as equal", () => {
			const leftState: TestTemporaryState = { viewState: null };
			const rightState: TestTemporaryState = { viewState: null };
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should detect differences in deeply nested viewState objects", () => {
			const leftState: TestTemporaryState = {
				viewState: {
					type: "markdown",
					state: {
						mode: "source",
						eState: {
							cursor: { from: 10, to: 20 },
							scroll: 75,
							selection: { ranges: [{ from: 5, to: 15 }] },
						},
					},
					file: "deep-test.md",
				},
			};
			const rightState: TestTemporaryState = {
				viewState: {
					type: "markdown",
					state: {
						mode: "source",
						eState: {
							cursor: { from: 10, to: 20 },
							scroll: 75,
							selection: { ranges: [{ from: 5, to: 16 }] },
						},
					},
					file: "deep-test.md",
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should handle viewStates with array properties", () => {
			const leftState: TestTemporaryState = {
				viewState: {
					type: "markdown",
					state: { tabs: ["tab1", "tab2", "tab3"] },
					file: "array-test.md",
				},
			};
			const rightState: TestTemporaryState = {
				viewState: {
					type: "markdown",
					state: { tabs: ["tab1", "tab2", "tab3"] },
					file: "array-test.md",
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should detect differences in array properties", () => {
			const leftState: TestTemporaryState = {
				viewState: {
					type: "markdown",
					state: { tabs: ["tab1", "tab2", "tab3"] },
					file: "array-test.md",
				},
			};
			const rightState: TestTemporaryState = {
				viewState: {
					type: "markdown",
					state: { tabs: ["tab1", "tab2", "tab4"] },
					file: "array-test.md",
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});
	});

	describe("combined state comparison", () => {
		it("should return true for identical complete states", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 10, line: 3 },
				},
				scroll: 150.75,
				viewState: {
					type: "markdown",
					state: { mode: "source" },
					file: "complete-test.md",
				},
			};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 10, line: 3 },
				},
				scroll: 150.75,
				viewState: {
					type: "markdown",
					state: { mode: "source" },
					file: "complete-test.md",
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should return false when cursor matches but scroll differs", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 10, line: 3 },
				},
				scroll: 150.75,
			};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 10, line: 3 },
				},
				scroll: 150.76,
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should return false when scroll matches but cursor differs", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 10, line: 3 },
				},
				scroll: 150.75,
			};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 6, line: 2 },
					end: { col: 10, line: 3 },
				},
				scroll: 150.75,
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should return false when cursor and scroll match but viewState differs", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 10, line: 3 },
				},
				scroll: 150.75,
				viewState: { type: "markdown", file: "test1.md" },
			};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 10, line: 3 },
				},
				scroll: 150.75,
				viewState: { type: "markdown", file: "test2.md" },
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should handle states with different property combinations", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 0, line: 0 },
				},
				viewState: { type: "markdown", file: "test.md" },
			};
			const rightState: TestTemporaryState = {
				scroll: 100,
				viewState: { type: "markdown", file: "test.md" },
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should handle states where one has all properties and other has subset", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 10, line: 3 },
				},
				scroll: 150.75,
				viewState: { type: "markdown", file: "test.md" },
			};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 10, line: 3 },
				},
				scroll: 150.75,
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});
	});

	describe("edge cases and boundary conditions", () => {
		it("should handle states with extra undefined properties", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 0, line: 0 },
				},
				scroll: undefined,
				viewState: undefined,
			};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 0, line: 0 },
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should handle states with mixed defined and undefined properties", () => {
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 0, line: 0 },
				},
				scroll: 100,
				viewState: undefined,
			};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 0, line: 0 },
				},
				scroll: 100,
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should handle cursor positions at maximum safe integer values", () => {
			const maxSafeInt = Number.MAX_SAFE_INTEGER;
			const leftState: TestTemporaryState = {
				cursor: {
					start: { col: maxSafeInt, line: maxSafeInt },
					end: { col: maxSafeInt, line: maxSafeInt },
				},
			};
			const rightState: TestTemporaryState = {
				cursor: {
					start: { col: maxSafeInt, line: maxSafeInt },
					end: { col: maxSafeInt, line: maxSafeInt },
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should handle scroll positions at maximum safe float values", () => {
			const maxValue = Number.MAX_VALUE;
			const leftState: TestTemporaryState = { scroll: maxValue };
			const rightState: TestTemporaryState = { scroll: maxValue };
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should handle very small floating point differences in scroll", () => {
			const leftState: TestTemporaryState = { scroll: 0.1 + 0.2 };
			const rightState: TestTemporaryState = { scroll: 0.3 };
			// Due to floating point precision, 0.1 + 0.2 !== 0.3
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should handle viewStates with circular reference structures", () => {
			const circularObj1: Record<string, unknown> = { type: "markdown" };
			circularObj1.self = circularObj1;

			const circularObj2: Record<string, unknown> = { type: "markdown" };
			circularObj2.self = circularObj2;

			const leftState: TestTemporaryState = { viewState: circularObj1 };
			const rightState: TestTemporaryState = { viewState: circularObj2 };

			// JSON.stringify should throw on circular references
			expect(() =>
				plugin.TemporaryStatesSame(leftState, rightState)
			).toThrow();
		});

		it("should handle viewStates with special values", () => {
			const leftState: TestTemporaryState = {
				viewState: {
					type: "markdown",
					special: {
						infinity: Infinity,
						negInfinity: -Infinity,
						nan: NaN,
						date: new Date("2023-01-01"),
					},
				},
			};
			const rightState: TestTemporaryState = {
				viewState: {
					type: "markdown",
					special: {
						infinity: Infinity,
						negInfinity: -Infinity,
						nan: NaN,
						date: new Date("2023-01-01"),
					},
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should detect differences in special values", () => {
			const leftState: TestTemporaryState = {
				viewState: {
					type: "markdown",
					special: { date: new Date("2023-01-01") },
				},
			};
			const rightState: TestTemporaryState = {
				viewState: {
					type: "markdown",
					special: { date: new Date("2023-01-02") },
				},
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(false);
		});

		it("should handle empty arrays in viewState", () => {
			const leftState: TestTemporaryState = {
				viewState: { type: "markdown", items: [] },
			};
			const rightState: TestTemporaryState = {
				viewState: { type: "markdown", items: [] },
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should handle empty objects in viewState", () => {
			const leftState: TestTemporaryState = {
				viewState: { type: "markdown", config: {} },
			};
			const rightState: TestTemporaryState = {
				viewState: { type: "markdown", config: {} },
			};
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});
	});

	describe("performance and stress testing", () => {
		it("should handle large viewState objects efficiently", () => {
			// Create large viewState objects
			const largeViewState = {
				type: "markdown",
				state: {},
				file: "large-test.md",
			};

			// Add many properties to stress test JSON.stringify comparison
			for (let i = 0; i < 1000; i++) {
				(largeViewState.state as Record<string, unknown>)[
					`property${i}`
				] = `value${i}`;
			}

			const leftState: TestTemporaryState = { viewState: largeViewState };
			const rightState: TestTemporaryState = {
				viewState: { ...largeViewState },
			};

			const startTime = Date.now();
			const result = plugin.TemporaryStatesSame(leftState, rightState);
			const endTime = Date.now();

			expect(result).toBe(true);
			// Should complete within reasonable time (less than 100ms)
			expect(endTime - startTime).toBeLessThan(100);
		});

		it("should handle deeply nested viewState objects", () => {
			// Create deeply nested structure
			let deepObj: Record<string, unknown> = { type: "markdown" };
			let current = deepObj;

			for (let i = 0; i < 50; i++) {
				current.nested = { level: i };
				current = current.nested as Record<string, unknown>;
			}

			const leftState: TestTemporaryState = { viewState: deepObj };
			const rightState: TestTemporaryState = {
				viewState: JSON.parse(JSON.stringify(deepObj)),
			};

			const result = plugin.TemporaryStatesSame(leftState, rightState);
			expect(result).toBe(true);
		});

		it("should handle multiple rapid comparisons", () => {
			const baseState: TestTemporaryState = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 10, line: 3 },
				},
				scroll: 150.75,
				viewState: { type: "markdown", file: "rapid-test.md" },
			};

			const startTime = Date.now();

			// Perform many comparisons
			for (let i = 0; i < 1000; i++) {
				const result = plugin.TemporaryStatesSame(baseState, baseState);
				expect(result).toBe(true);
			}

			const endTime = Date.now();

			// Should complete all comparisons within reasonable time
			expect(endTime - startTime).toBeLessThan(100);
		});
	});
});
