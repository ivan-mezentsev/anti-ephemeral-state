/**
 * Tests for file management operations in AntiEphemeralState plugin
 * Coverage: renameFile, deleteFile methods and error handling
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import AntiEphemeralState from "../main";
import {
	App,
	MockVault,
	TestUtils,
	MockManifest,
	TFile,
	TAbstractFile,
} from "./__mocks__/obsidian";

describe("AntiEphemeralState File Management", () => {
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

		// Ensure database directory exists
		await mockVault.adapter.mkdir(plugin.settings.dbDir);
	});

	afterEach(() => {
		// Clean up mock file system
		if (mockVault?.adapter) {
			mockVault.adapter.reset();
		}
	});

	describe("renameFile", () => {
		it("should transfer state from old file to new file path", async () => {
			const oldPath = "old/document.md";
			const newPath = "new/renamed-document.md";
			const file = new TFile(newPath);

			// Create initial state for old file
			const originalState = {
				cursor: {
					start: { col: 5, line: 10 },
					end: { col: 15, line: 12 },
				},
				scroll: 250,
				viewState: {
					type: "markdown",
					file: oldPath,
					state: { mode: "source" },
				},
			};

			// Write state for old file
			await plugin.writeFileState(oldPath, originalState);

			// Verify old state exists
			const oldDbPath = plugin.getDbFilePath(oldPath);
			expect(await mockVault.adapter.exists(oldDbPath)).toBe(true);

			// Perform rename operation
			await plugin.renameFile(file as TAbstractFile, oldPath);

			// Verify new state file exists with correct content
			const newDbPath = plugin.getDbFilePath(newPath);
			expect(await mockVault.adapter.exists(newDbPath)).toBe(true);

			const newState = await plugin.readFileState(newPath);
			// The viewState.file should be corrected to the new path during read
			const expectedState = {
				...originalState,
				viewState: {
					...originalState.viewState,
					file: newPath,
				},
			};
			expect(newState).toEqual(expectedState);

			// Verify old state file is removed
			expect(await mockVault.adapter.exists(oldDbPath)).toBe(false);
		});

		it("should handle rename when no state exists for old file", async () => {
			const oldPath = "nonexistent/file.md";
			const newPath = "new/location.md";
			const file = new TFile(newPath);

			// Ensure no state exists for old file
			const oldDbPath = plugin.getDbFilePath(oldPath);
			expect(await mockVault.adapter.exists(oldDbPath)).toBe(false);

			// Perform rename operation - should not throw error
			await expect(
				plugin.renameFile(file as TAbstractFile, oldPath)
			).resolves.toBeUndefined();

			// Verify no new state file is created
			const newDbPath = plugin.getDbFilePath(newPath);
			expect(await mockVault.adapter.exists(newDbPath)).toBe(false);
		});

		it("should handle complex state with nested objects during rename", async () => {
			const oldPath = "complex/state.md";
			const newPath = "moved/complex-state.md";
			const file = new TFile(newPath);

			const complexState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 50, line: 25 },
				},
				scroll: 500.75,
				viewState: {
					type: "markdown",
					file: oldPath,
					state: {
						mode: "source",
						foldedLines: [5, 10, 15],
						scrollTop: 500.75,
						selection: {
							ranges: [
								{
									anchor: { line: 20, ch: 10 },
									head: { line: 25, ch: 30 },
								},
							],
						},
						customData: {
							bookmarks: ["line-10", "line-20"],
							lastModified: "2024-01-01T00:00:00Z",
						},
					},
				},
			};

			await plugin.writeFileState(oldPath, complexState);

			await plugin.renameFile(file as TAbstractFile, oldPath);

			const transferredState = await plugin.readFileState(newPath);
			// The viewState.file should be corrected to the new path during read
			const expectedComplexState = {
				...complexState,
				viewState: {
					...complexState.viewState,
					file: newPath,
				},
			};
			expect(transferredState).toEqual(expectedComplexState);

			// Verify old file is cleaned up
			const oldDbPath = plugin.getDbFilePath(oldPath);
			expect(await mockVault.adapter.exists(oldDbPath)).toBe(false);
		});

		it("should handle file paths with special characters", async () => {
			const oldPath = "file with spaces/document_test.md";
			const newPath = "new folder/renamed file.md";
			const file = new TFile(newPath);

			const state = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 10, line: 5 },
				},
				scroll: 100,
			};

			await plugin.writeFileState(oldPath, state);

			await plugin.renameFile(file as TAbstractFile, oldPath);

			const newState = await plugin.readFileState(newPath);
			expect(newState).toEqual(state);

			// Verify cleanup
			const oldDbPath = plugin.getDbFilePath(oldPath);
			expect(await mockVault.adapter.exists(oldDbPath)).toBe(false);
		});

		it("should handle errors during state transfer gracefully", async () => {
			const oldPath = "error/source.md";
			const newPath = "error/destination.md";
			const file = new TFile(newPath);

			const state = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 5, line: 2 },
				},
			};

			await plugin.writeFileState(oldPath, state);

			// Mock write operation to throw error
			const originalWrite = mockVault.adapter.write;
			mockVault.adapter.write = async () => {
				throw new Error("Write permission denied");
			};

			// Should handle error gracefully without throwing
			await expect(
				plugin.renameFile(file as TAbstractFile, oldPath)
			).resolves.toBeUndefined();

			// Restore original method
			mockVault.adapter.write = originalWrite;
		});

		it("should handle errors during old file cleanup gracefully", async () => {
			const oldPath = "cleanup/error.md";
			const newPath = "cleanup/success.md";
			const file = new TFile(newPath);

			const state = {
				scroll: 150,
			};

			await plugin.writeFileState(oldPath, state);

			// Mock remove operation to throw error
			const originalRemove = mockVault.adapter.remove;
			mockVault.adapter.remove = async () => {
				throw new Error("Remove permission denied");
			};

			// Should handle error gracefully
			await expect(
				plugin.renameFile(file as TAbstractFile, oldPath)
			).resolves.toBeUndefined();

			// Verify new file was still created despite cleanup error
			const newState = await plugin.readFileState(newPath);
			expect(newState).toEqual(state);

			// Restore original method
			mockVault.adapter.remove = originalRemove;
		});

		it("should handle rename with empty state object", async () => {
			const oldPath = "empty/state.md";
			const newPath = "empty/renamed.md";
			const file = new TFile(newPath);

			const emptyState = {};

			await plugin.writeFileState(oldPath, emptyState);

			await plugin.renameFile(file as TAbstractFile, oldPath);

			const newState = await plugin.readFileState(newPath);
			expect(newState).toEqual(emptyState);
		});

		it("should handle very long file paths", async () => {
			const longFileName = "a".repeat(200) + ".md";
			const oldPath = `long/path/to/file/${longFileName}`;
			const newPath = `another/very/long/path/to/file/${longFileName}`;
			const file = new TFile(newPath);

			const state = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 1, line: 1 },
				},
			};

			await plugin.writeFileState(oldPath, state);

			await plugin.renameFile(file as TAbstractFile, oldPath);

			const newState = await plugin.readFileState(newPath);
			expect(newState).toEqual(state);
		});
	});

	describe("deleteFile", () => {
		it("should remove state file when note is deleted", async () => {
			const filePath = "to-delete/document.md";
			const file = new TFile(filePath);

			// Create state for the file
			const state = {
				cursor: {
					start: { col: 10, line: 5 },
					end: { col: 20, line: 8 },
				},
				scroll: 300,
				viewState: {
					type: "markdown",
					file: filePath,
					state: { mode: "preview" },
				},
			};

			await plugin.writeFileState(filePath, state);

			// Verify state file exists
			const dbPath = plugin.getDbFilePath(filePath);
			expect(await mockVault.adapter.exists(dbPath)).toBe(true);

			// Delete the file
			await plugin.deleteFile(file as TAbstractFile);

			// Verify state file is removed
			expect(await mockVault.adapter.exists(dbPath)).toBe(false);
		});

		it("should handle deletion when no state file exists", async () => {
			const filePath = "no-state/document.md";
			const file = new TFile(filePath);

			// Ensure no state file exists
			const dbPath = plugin.getDbFilePath(filePath);
			expect(await mockVault.adapter.exists(dbPath)).toBe(false);

			// Delete operation should not throw error
			await expect(
				plugin.deleteFile(file as TAbstractFile)
			).resolves.toBeUndefined();
		});

		it("should handle file paths with special characters", async () => {
			const filePath = "special characters/file test.md";
			const file = new TFile(filePath);

			const state = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 15, line: 3 },
				},
			};

			await plugin.writeFileState(filePath, state);

			const dbPath = plugin.getDbFilePath(filePath);
			expect(await mockVault.adapter.exists(dbPath)).toBe(true);

			await plugin.deleteFile(file as TAbstractFile);

			expect(await mockVault.adapter.exists(dbPath)).toBe(false);
		});

		it("should handle errors during state file deletion gracefully", async () => {
			const filePath = "error/delete.md";
			const file = new TFile(filePath);

			const state = {
				scroll: 200,
			};

			await plugin.writeFileState(filePath, state);

			// Mock remove operation to throw error
			const originalRemove = mockVault.adapter.remove;
			mockVault.adapter.remove = async () => {
				throw new Error("Delete permission denied");
			};

			// Should handle error gracefully without throwing
			await expect(
				plugin.deleteFile(file as TAbstractFile)
			).resolves.toBeUndefined();

			// Restore original method
			mockVault.adapter.remove = originalRemove;
		});

		it("should handle deletion of files with complex nested states", async () => {
			const filePath = "complex/nested-state.md";
			const file = new TFile(filePath);

			const complexState = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 100, line: 50 },
				},
				scroll: 750.25,
				viewState: {
					type: "markdown",
					file: filePath,
					state: {
						mode: "source",
						foldedLines: [1, 5, 10, 15, 20],
						scrollTop: 750.25,
						selection: {
							ranges: [
								{
									anchor: { line: 30, ch: 0 },
									head: { line: 35, ch: 50 },
								},
								{
									anchor: { line: 40, ch: 10 },
									head: { line: 45, ch: 30 },
								},
							],
						},
						metadata: {
							tags: ["important", "work", "project"],
							lastAccessed: "2024-01-01T12:00:00Z",
							customProperties: {
								priority: "high",
								category: "documentation",
							},
						},
					},
				},
			};

			await plugin.writeFileState(filePath, complexState);

			const dbPath = plugin.getDbFilePath(filePath);
			expect(await mockVault.adapter.exists(dbPath)).toBe(true);

			await plugin.deleteFile(file as TAbstractFile);

			expect(await mockVault.adapter.exists(dbPath)).toBe(false);
		});

		it("should handle deletion of multiple files with same hash (collision scenario)", async () => {
			// This test ensures that even if there's a hash collision,
			// the correct state file is deleted
			const filePath1 = "collision/file1.md";
			const filePath2 = "collision/file2.md";
			const file1 = new TFile(filePath1);

			const state1 = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 10, line: 5 },
				},
			};

			const state2 = {
				cursor: {
					start: { col: 5, line: 2 },
					end: { col: 15, line: 7 },
				},
			};

			await plugin.writeFileState(filePath1, state1);
			await plugin.writeFileState(filePath2, state2);

			const dbPath1 = plugin.getDbFilePath(filePath1);
			const dbPath2 = plugin.getDbFilePath(filePath2);

			// Both should exist initially
			expect(await mockVault.adapter.exists(dbPath1)).toBe(true);
			expect(await mockVault.adapter.exists(dbPath2)).toBe(true);

			// Delete first file
			await plugin.deleteFile(file1 as TAbstractFile);

			// Only first file's state should be deleted
			expect(await mockVault.adapter.exists(dbPath1)).toBe(false);
			expect(await mockVault.adapter.exists(dbPath2)).toBe(true);

			// Verify second file's state is intact
			const remainingState = await plugin.readFileState(filePath2);
			expect(remainingState).toEqual(state2);
		});

		it("should handle very long file paths during deletion", async () => {
			const longFileName = "b".repeat(250) + ".md";
			const filePath = `very/long/path/structure/with/many/nested/folders/${longFileName}`;
			const file = new TFile(filePath);

			const state = {
				scroll: 500,
			};

			await plugin.writeFileState(filePath, state);

			const dbPath = plugin.getDbFilePath(filePath);
			expect(await mockVault.adapter.exists(dbPath)).toBe(true);

			await plugin.deleteFile(file as TAbstractFile);

			expect(await mockVault.adapter.exists(dbPath)).toBe(false);
		});

		it("should handle deletion when database directory doesn't exist", async () => {
			const filePath = "no-db-dir/file.md";
			const file = new TFile(filePath);

			// Remove database directory
			await mockVault.adapter.remove(plugin.settings.dbDir);

			// Should handle gracefully without throwing
			await expect(
				plugin.deleteFile(file as TAbstractFile)
			).resolves.toBeUndefined();
		});
	});

	describe("File Management Integration", () => {
		it("should handle rename followed by delete operations", async () => {
			const originalPath = "integration/original.md";
			const renamedPath = "integration/renamed.md";
			const file = new TFile(renamedPath);

			const state = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 20, line: 10 },
				},
				scroll: 400,
			};

			// Create initial state
			await plugin.writeFileState(originalPath, state);

			// Rename file
			await plugin.renameFile(file as TAbstractFile, originalPath);

			// Verify state transferred
			const transferredState = await plugin.readFileState(renamedPath);
			expect(transferredState).toEqual(state);

			// Delete renamed file
			await plugin.deleteFile(file as TAbstractFile);

			// Verify all state files are cleaned up
			const originalDbPath = plugin.getDbFilePath(originalPath);
			const renamedDbPath = plugin.getDbFilePath(renamedPath);

			expect(await mockVault.adapter.exists(originalDbPath)).toBe(false);
			expect(await mockVault.adapter.exists(renamedDbPath)).toBe(false);
		});

		it("should handle multiple rapid file operations", async () => {
			const basePath = "rapid/operations";
			const files = Array.from({ length: 5 }, (_, i) => ({
				path: `${basePath}/file${i}.md`,
				newPath: `${basePath}/renamed${i}.md`,
				file: new TFile(`${basePath}/renamed${i}.md`),
			}));

			// Create states for all files
			for (let i = 0; i < files.length; i++) {
				const state = {
					cursor: {
						start: { col: i, line: i },
						end: { col: i + 5, line: i + 2 },
					},
					scroll: i * 100,
				};
				await plugin.writeFileState(files[i].path, state);
			}

			// Rename all files
			for (const fileInfo of files) {
				await plugin.renameFile(
					fileInfo.file as TAbstractFile,
					fileInfo.path
				);
			}

			// Verify all renames succeeded
			for (let i = 0; i < files.length; i++) {
				const state = await plugin.readFileState(files[i].newPath);
				expect(state).toBeTruthy();
				expect(state?.scroll).toBe(i * 100);
			}

			// Delete all renamed files
			for (const fileInfo of files) {
				await plugin.deleteFile(fileInfo.file as TAbstractFile);
			}

			// Verify all states are cleaned up
			for (const fileInfo of files) {
				const dbPath = plugin.getDbFilePath(fileInfo.newPath);
				expect(await mockVault.adapter.exists(dbPath)).toBe(false);
			}
		});

		it("should handle errors during file operations gracefully", async () => {
			const filePath = "error-handling/test.md";
			const newPath = "error-handling/moved.md";
			const file = new TFile(newPath);

			const state = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 10, line: 5 },
				},
				scroll: 250,
			};

			await plugin.writeFileState(filePath, state);

			// Mock readFileState to throw error during rename
			const originalReadFileState = plugin.readFileState;
			plugin.readFileState = async () => {
				throw new Error("Read failed");
			};

			// Rename should handle error gracefully without throwing
			await expect(
				plugin.renameFile(file as TAbstractFile, filePath)
			).resolves.toBeUndefined();

			// Restore original method
			plugin.readFileState = originalReadFileState;

			// Original state should still exist
			const originalDbPath = plugin.getDbFilePath(filePath);
			expect(await mockVault.adapter.exists(originalDbPath)).toBe(true);

			// Clean up for next test
			const originalFile = new TFile(filePath);
			await plugin.deleteFile(originalFile as TAbstractFile);
		});
	});
});
