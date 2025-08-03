/**
 * Tests for file state operations in AntiEphemeralState plugin
 * Coverage: readFileState, writeFileState, validateDatabase methods
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import AntiEphemeralState from "../main";
import {
	App,
	MockVault,
	TestUtils,
	MockManifest,
	ViewState,
} from "./__mocks__/obsidian";

describe("AntiEphemeralState File State Operations", () => {
	let plugin: AntiEphemeralState;
	let app: App;
	let manifest: MockManifest;
	let mockVault: MockVault;

	beforeEach(async () => {
		// Create test app with standard configDir
		app = TestUtils.createMockApp("/test/.obsidian");
		manifest = TestUtils.createMockManifest({
			id: "anti-ephemeral-state",
			name: "Anti-Ephemeral State",
			version: "1.0.0",
		});

		// Create plugin with proper typing approach from other tests
		plugin = new (AntiEphemeralState as unknown as new (
			app: App,
			manifest: MockManifest
		) => AntiEphemeralState)(app, manifest);

		mockVault = app.vault as MockVault;

		// Initialize plugin settings
		plugin.DEFAULT_SETTINGS = {
			dbDir: "/test/.obsidian/plugins/anti-ephemeral-state/db",
		};
		plugin.settings = { ...plugin.DEFAULT_SETTINGS };
	});

	afterEach(() => {
		// Clean up mock file system
		if (mockVault?.adapter) {
			mockVault.adapter.reset();
		}
	});

	describe("readFileState", () => {
		it("should return null for non-existent state files", async () => {
			const filePath = "test/example.md";
			const result = await plugin.readFileState(filePath);
			expect(result).toBeNull();
		});

		it("should read valid state from existing file", async () => {
			const filePath = "test/example.md";
			const expectedState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 2 },
				},
				scroll: 100,
				viewState: {
					type: "markdown",
					file: filePath,
					state: { mode: "source" },
				},
			};

			// Create state file manually
			const dbFilePath = plugin.getDbFilePath(filePath);
			await mockVault.adapter.write(
				dbFilePath,
				JSON.stringify(expectedState)
			);

			const result = await plugin.readFileState(filePath);
			expect(result).toEqual(expectedState);
		});

		it("should handle invalid JSON gracefully", async () => {
			const filePath = "test/invalid.md";
			const dbFilePath = plugin.getDbFilePath(filePath);

			// Write invalid JSON
			await mockVault.adapter.write(dbFilePath, "{ invalid json content");

			const result = await plugin.readFileState(filePath);
			expect(result).toBeNull();
		});

		it("should handle file system errors gracefully", async () => {
			const filePath = "test/error.md";

			// Mock adapter to throw error
			const originalRead = mockVault.adapter.read;
			mockVault.adapter.read = async () => {
				throw new Error("File system error");
			};

			const result = await plugin.readFileState(filePath);
			expect(result).toBeNull();

			// Restore original method
			mockVault.adapter.read = originalRead;
		});

		it("should validate and fix incorrect viewState.file field", async () => {
			const filePath = "test/correct.md";
			const incorrectState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 2 },
				},
				viewState: {
					type: "markdown",
					file: "wrong/path.md", // Incorrect file path
					state: { mode: "source" },
				},
			};

			const dbFilePath = plugin.getDbFilePath(filePath);
			await mockVault.adapter.write(
				dbFilePath,
				JSON.stringify(incorrectState)
			);

			const result = await plugin.readFileState(filePath);

			// Should return corrected state
			expect(result).not.toBeNull();
			if (result?.viewState) {
				expect((result.viewState as ViewState).file).toBe(filePath);
			}

			// Verify the file was updated on disk
			const updatedContent = await mockVault.adapter.read(dbFilePath);
			const updatedState = JSON.parse(updatedContent);
			expect(updatedState.viewState.file).toBe(filePath);
		});

		it("should return null when flashing span is present", async () => {
			const filePath = "test/flashing.md";
			const state = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 2 },
				},
			};

			const dbFilePath = plugin.getDbFilePath(filePath);
			await mockVault.adapter.write(dbFilePath, JSON.stringify(state));

			// Mock DOM element with flashing span
			const flashingSpan = document.createElement("span");
			flashingSpan.className = "is-flashing";

			const originalQuerySelector =
				app.workspace.containerEl.querySelector;
			app.workspace.containerEl.querySelector = () => flashingSpan;

			const result = await plugin.readFileState(filePath);
			expect(result).toBeNull();

			// Restore original method
			app.workspace.containerEl.querySelector = originalQuerySelector;
		});

		it("should handle state with missing viewState", async () => {
			const filePath = "test/no-viewstate.md";
			const state = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 2 },
				},
				scroll: 50,
			};

			const dbFilePath = plugin.getDbFilePath(filePath);
			await mockVault.adapter.write(dbFilePath, JSON.stringify(state));

			const result = await plugin.readFileState(filePath);
			expect(result).toEqual(state);
		});

		it("should handle empty state file", async () => {
			const filePath = "test/empty.md";
			const dbFilePath = plugin.getDbFilePath(filePath);

			await mockVault.adapter.write(dbFilePath, "{}");

			const result = await plugin.readFileState(filePath);
			expect(result).toEqual({});
		});
	});

	describe("writeFileState", () => {
		it("should write state to correct file path", async () => {
			const filePath = "test/write-example.md";
			const state = {
				cursor: {
					start: { col: 10, line: 5 },
					end: { col: 20, line: 7 },
				},
				scroll: 150,
				viewState: {
					type: "markdown",
					file: filePath,
					state: { mode: "preview" },
				},
			};

			await plugin.writeFileState(filePath, state);

			const dbFilePath = plugin.getDbFilePath(filePath);
			expect(await mockVault.adapter.exists(dbFilePath)).toBe(true);

			const savedContent = await mockVault.adapter.read(dbFilePath);
			const savedState = JSON.parse(savedContent);
			expect(savedState).toEqual(state);
		});

		it("should create database directory if it doesn't exist", async () => {
			const filePath = "test/new-dir.md";
			const state = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 0, line: 0 },
				},
			};

			// Ensure directory doesn't exist initially
			expect(await mockVault.adapter.exists(plugin.settings.dbDir)).toBe(
				false
			);

			await plugin.writeFileState(filePath, state);

			// Directory should be created
			expect(await mockVault.adapter.exists(plugin.settings.dbDir)).toBe(
				true
			);

			// File should be written
			const dbFilePath = plugin.getDbFilePath(filePath);
			expect(await mockVault.adapter.exists(dbFilePath)).toBe(true);
		});

		it("should handle write errors gracefully", async () => {
			const filePath = "test/write-error.md";
			const state = {
				scroll: 100,
			};

			// Mock adapter to throw error
			const originalWrite = mockVault.adapter.write;
			mockVault.adapter.write = async () => {
				throw new Error("Write permission denied");
			};

			// Should not throw error
			await expect(
				plugin.writeFileState(filePath, state)
			).resolves.toBeUndefined();

			// Restore original method
			mockVault.adapter.write = originalWrite;
		});

		it("should write complex nested state correctly", async () => {
			const filePath = "test/complex-state.md";
			const state = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 100, line: 50 },
				},
				scroll: 250,
				viewState: {
					type: "markdown",
					file: filePath,
					state: {
						mode: "source",
						foldedLines: [1, 2, 3],
						scrollTop: 250,
						selection: {
							ranges: [
								{
									anchor: { line: 10, ch: 0 },
									head: { line: 15, ch: 20 },
								},
							],
						},
					},
				},
			};

			await plugin.writeFileState(filePath, state);

			// Verify complex state is preserved
			const dbFilePath = plugin.getDbFilePath(filePath);
			const savedContent = await mockVault.adapter.read(dbFilePath);
			const savedState = JSON.parse(savedContent);
			expect(savedState).toEqual(state);
		});

		it("should handle state with special characters in file path", async () => {
			const filePath = "test/файл с пробелами и русскими_символами.md";
			const state = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 10, line: 5 },
				},
			};

			await plugin.writeFileState(filePath, state);

			const dbFilePath = plugin.getDbFilePath(filePath);
			expect(await mockVault.adapter.exists(dbFilePath)).toBe(true);

			const savedContent = await mockVault.adapter.read(dbFilePath);
			const savedState = JSON.parse(savedContent);
			expect(savedState).toEqual(state);
		});

		it("should overwrite existing state file", async () => {
			const filePath = "test/overwrite.md";
			const initialState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 2 },
				},
			};
			const newState = {
				cursor: {
					start: { col: 10, line: 10 },
					end: { col: 15, line: 12 },
				},
				scroll: 300,
			};

			// Write initial state
			await plugin.writeFileState(filePath, initialState);

			// Overwrite with new state
			await plugin.writeFileState(filePath, newState);

			// Verify new state is saved
			const dbFilePath = plugin.getDbFilePath(filePath);
			const savedContent = await mockVault.adapter.read(dbFilePath);
			const savedState = JSON.parse(savedContent);
			expect(savedState).toEqual(newState);
		});
	});

	describe("validateDatabase", () => {
		beforeEach(async () => {
			// Ensure database directory exists for validation tests
			await mockVault.adapter.mkdir(plugin.settings.dbDir);
		});

		it("should handle non-existent database directory", async () => {
			// Remove directory
			await mockVault.adapter.remove(plugin.settings.dbDir);

			// Should not throw error
			await expect(plugin.validateDatabase()).resolves.toBeUndefined();
		});

		it("should validate and fix incorrect viewState.file paths", async () => {
			const filePath1 = "valid/file1.md";
			const filePath2 = "valid/file2.md";

			// Create states with incorrect file paths but valid structure
			const incorrectState1 = {
				viewState: { file: "wrong/path1.md" },
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 2 },
				},
			};
			const incorrectState2 = {
				viewState: { file: "wrong/path2.md" },
				scroll: 100,
			};

			const dbFilePath1 = plugin.getDbFilePath(filePath1);
			const dbFilePath2 = plugin.getDbFilePath(filePath2);

			await mockVault.adapter.write(
				dbFilePath1,
				JSON.stringify(incorrectState1)
			);
			await mockVault.adapter.write(
				dbFilePath2,
				JSON.stringify(incorrectState2)
			);

			// Create the actual files in vault that viewState.file should point to
			await mockVault.adapter.write("wrong/path1.md", "# File 1 content");
			await mockVault.adapter.write("wrong/path2.md", "# File 2 content");

			await plugin.validateDatabase();

			// Files should exist since the viewState.file files exist
			expect(await mockVault.adapter.exists(dbFilePath1)).toBe(true);
			expect(await mockVault.adapter.exists(dbFilePath2)).toBe(true);

			// Verify files were corrected to maintain consistency
			const correctedContent1 = await mockVault.adapter.read(dbFilePath1);
			const correctedState1 = JSON.parse(correctedContent1);
			expect(correctedState1.viewState.file).toBe("wrong/path1.md");

			const correctedContent2 = await mockVault.adapter.read(dbFilePath2);
			const correctedState2 = JSON.parse(correctedContent2);
			expect(correctedState2.viewState.file).toBe("wrong/path2.md");
		});

		it("should remove database entries for missing files", async () => {
			const existingFile = "existing/file.md";
			const missingFile = "missing/file.md";

			const stateExisting = {
				viewState: { file: existingFile },
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 2 },
				},
			};
			const stateMissing = {
				viewState: { file: missingFile },
				scroll: 200,
			};

			const dbFilePathExisting = plugin.getDbFilePath(existingFile);
			const dbFilePathMissing = plugin.getDbFilePath(missingFile);

			await mockVault.adapter.write(
				dbFilePathExisting,
				JSON.stringify(stateExisting)
			);
			await mockVault.adapter.write(
				dbFilePathMissing,
				JSON.stringify(stateMissing)
			);

			// Create only the existing file
			await mockVault.adapter.write(
				existingFile,
				"# Existing file content"
			);

			await plugin.validateDatabase();

			// Existing file state should remain
			expect(await mockVault.adapter.exists(dbFilePathExisting)).toBe(
				true
			);

			// Missing file state should be removed
			expect(await mockVault.adapter.exists(dbFilePathMissing)).toBe(
				false
			);
		});

		it("should remove invalid JSON entries", async () => {
			const validFile = "valid/json.md";
			const invalidFile = "invalid/json.md";

			const validState = {
				viewState: { file: validFile }, // Need viewState.file for validation
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 2 },
				},
			};

			const dbFilePathValid = plugin.getDbFilePath(validFile);
			const dbFilePathInvalid = plugin.getDbFilePath(invalidFile);

			await mockVault.adapter.write(
				dbFilePathValid,
				JSON.stringify(validState)
			);
			await mockVault.adapter.write(
				dbFilePathInvalid,
				"{ invalid json content"
			);

			// Create the file that exists in vault for valid state
			await mockVault.adapter.write(validFile, "# Valid file");
			// Don't create invalidFile to make it a valid test case

			await plugin.validateDatabase();

			// Valid state should remain
			expect(await mockVault.adapter.exists(dbFilePathValid)).toBe(true);

			// Invalid JSON state should be removed
			expect(await mockVault.adapter.exists(dbFilePathInvalid)).toBe(
				false
			);
		});

		it("should handle database directory with non-JSON files", async () => {
			// Add some non-JSON files to database directory
			await mockVault.adapter.write(
				`${plugin.settings.dbDir}/readme.txt`,
				"Not JSON"
			);
			await mockVault.adapter.write(
				`${plugin.settings.dbDir}/data.xml`,
				"<xml>data</xml>"
			);

			const validFile = "test/valid.md";
			const validState = {
				viewState: { file: validFile }, // Need viewState.file for validation
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 2 },
				},
			};

			const dbFilePath = plugin.getDbFilePath(validFile);
			await mockVault.adapter.write(
				dbFilePath,
				JSON.stringify(validState)
			);
			await mockVault.adapter.write(validFile, "# Valid file");

			// Should not throw error and should process JSON files correctly
			await expect(plugin.validateDatabase()).resolves.toBeUndefined();

			// Valid JSON state should remain
			expect(await mockVault.adapter.exists(dbFilePath)).toBe(true);

			// Non-JSON files should remain untouched
			expect(
				await mockVault.adapter.exists(
					`${plugin.settings.dbDir}/readme.txt`
				)
			).toBe(true);
			expect(
				await mockVault.adapter.exists(
					`${plugin.settings.dbDir}/data.xml`
				)
			).toBe(true);
		});

		it("should handle empty database directory", async () => {
			// Directory exists but is empty
			await expect(plugin.validateDatabase()).resolves.toBeUndefined();
		});

		it("should handle file system errors during validation", async () => {
			const testFile = "test/error.md";
			const testState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 2 },
				},
			};

			const dbFilePath = plugin.getDbFilePath(testFile);
			await mockVault.adapter.write(
				dbFilePath,
				JSON.stringify(testState)
			);

			// Mock adapter.list to throw error
			const originalList = mockVault.adapter.list;
			mockVault.adapter.list = async () => {
				throw new Error("Permission denied");
			};

			// Should handle error gracefully
			await expect(plugin.validateDatabase()).resolves.toBeUndefined();

			// Restore original method
			mockVault.adapter.list = originalList;
		});

		it("should remove entries without viewState.file", async () => {
			const stateWithoutViewState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 2 },
				},
				scroll: 100,
			};

			const stateWithEmptyViewState = {
				viewState: {},
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 2 },
				},
			};

			const stateWithNullFile = {
				viewState: { file: null },
				scroll: 200,
			};

			const dbFilePath1 = plugin.getDbFilePath("no-viewstate");
			const dbFilePath2 = plugin.getDbFilePath("empty-viewstate");
			const dbFilePath3 = plugin.getDbFilePath("null-file");

			await mockVault.adapter.write(
				dbFilePath1,
				JSON.stringify(stateWithoutViewState)
			);
			await mockVault.adapter.write(
				dbFilePath2,
				JSON.stringify(stateWithEmptyViewState)
			);
			await mockVault.adapter.write(
				dbFilePath3,
				JSON.stringify(stateWithNullFile)
			);

			await plugin.validateDatabase();

			// All entries should be removed as they cannot be correlated to notes
			expect(await mockVault.adapter.exists(dbFilePath1)).toBe(false);
			expect(await mockVault.adapter.exists(dbFilePath2)).toBe(false);
			expect(await mockVault.adapter.exists(dbFilePath3)).toBe(false);
		});

		it("should handle validation statistics correctly", async () => {
			// Create various test scenarios
			const validFile = "valid/file.md";
			const missingFile = "missing/file.md";
			const invalidJsonFile = "invalid.json";
			const fixableFile = "fixable/file.md";

			// Valid state
			const validState = {
				viewState: { file: validFile },
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 2 },
				},
			};

			// State for missing file
			const missingState = {
				viewState: { file: missingFile },
				scroll: 100,
			};

			// State with wrong viewState.file that needs fixing
			const fixableState = {
				viewState: { file: "wrong/path.md" },
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 2 },
				},
			};

			// Write states to database
			await mockVault.adapter.write(
				plugin.getDbFilePath(validFile),
				JSON.stringify(validState)
			);
			await mockVault.adapter.write(
				plugin.getDbFilePath(missingFile),
				JSON.stringify(missingState)
			);
			await mockVault.adapter.write(
				`${plugin.settings.dbDir}/${invalidJsonFile}`,
				"{ invalid json"
			);
			await mockVault.adapter.write(
				plugin.getDbFilePath(fixableFile),
				JSON.stringify(fixableState)
			);

			// Create only the valid file and fixable file in vault
			await mockVault.adapter.write(validFile, "# Valid content");
			await mockVault.adapter.write(
				"wrong/path.md",
				"# Wrong path content"
			);

			// Mock console.log to capture validation report
			const originalConsoleLog = console.log;
			const logCalls: unknown[][] = [];
			console.log = (...args: unknown[]) => {
				logCalls.push(args);
			};

			await plugin.validateDatabase();

			// Restore console.log
			console.log = originalConsoleLog;

			// Check that validation report was logged
			const validationReport = logCalls.find(
				call => call[0] === "[AES] Validation report"
			);
			expect(validationReport).toBeDefined();

			if (validationReport && validationReport[1]) {
				const stats = validationReport[1] as Record<string, number>;
				expect(stats.total).toBe(4); // 4 JSON files processed
				expect(stats.fixedViewStatePath).toBe(0); // No files fixed (validation uses viewState.file as source of truth)
				expect(stats.removedMissingNote).toBe(1); // 1 missing file removed
				expect(stats.removedInvalidEntry).toBe(1); // 1 invalid JSON removed
				expect(stats.errors).toBe(0); // No errors
			}
		});

		it("should handle errors during individual file processing", async () => {
			const testFile = "test/process-error.md";
			const testState = {
				viewState: { file: testFile },
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 2 },
				},
			};

			const dbFilePath = plugin.getDbFilePath(testFile);
			await mockVault.adapter.write(
				dbFilePath,
				JSON.stringify(testState)
			);

			// Create the file in vault
			await mockVault.adapter.write(testFile, "# Test content");

			// Mock adapter.exists to throw error for this specific file
			const originalExists = mockVault.adapter.exists;
			mockVault.adapter.exists = async (path: string) => {
				if (path === testFile) {
					throw new Error("File access error");
				}
				return originalExists.call(mockVault.adapter, path);
			};

			// Mock console.error to capture error logs
			const originalConsoleError = console.error;
			const errorCalls: unknown[][] = [];
			console.error = (...args: unknown[]) => {
				errorCalls.push(args);
			};

			await plugin.validateDatabase();

			// Restore methods
			mockVault.adapter.exists = originalExists;
			console.error = originalConsoleError;

			// Check that error was logged
			const errorLog = errorCalls.find(
				call => call[0] === "[AES] Validation error for DB file:"
			);
			expect(errorLog).toBeDefined();
		});

		it("should create viewState object when fixing missing file field", async () => {
			const testFile = "test/missing-viewstate-obj.md";
			const stateWithoutViewStateObj = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 2 },
				},
				scroll: 100,
			};

			// Manually add viewState.file to make it correlatable but without viewState object
			const stateWithFileButNoViewState = {
				...stateWithoutViewStateObj,
				viewState: { file: testFile },
			};

			const dbFilePath = plugin.getDbFilePath(testFile);
			await mockVault.adapter.write(
				dbFilePath,
				JSON.stringify(stateWithFileButNoViewState)
			);

			// Create the file in vault
			await mockVault.adapter.write(testFile, "# Test content");

			await plugin.validateDatabase();

			// Verify the state was preserved and viewState object exists
			expect(await mockVault.adapter.exists(dbFilePath)).toBe(true);

			const updatedContent = await mockVault.adapter.read(dbFilePath);
			const updatedState = JSON.parse(updatedContent);
			expect(updatedState.viewState).toBeDefined();
			expect(updatedState.viewState.file).toBe(testFile);
		});
	});
});
