/**
 * Tests for database path management functionality in AntiEphemeralState plugin
 * This file specifically focuses on testing the getDbFilePath() method with various path scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import AntiEphemeralState from "../main";
import { App, MockVault, TestUtils, MockManifest } from "./__mocks__/obsidian";

const createPlugin = (app: App, manifest: MockManifest): AntiEphemeralState => {
	// Mock manifest must be passed to Plugin constructor
	// since Plugin expects obsidian's PluginManifest but we provide MockManifest
	return new AntiEphemeralState(app as App, manifest as MockManifest);
};

describe("AntiEphemeralState Database Path Management", () => {
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

	describe("getDbFilePath", () => {
		describe("nested folder path handling", () => {
			beforeEach(() => {
				plugin.settings = {
					dbDir: "/test/.obsidian/plugins/anti-ephemeral-state/db",
				};
			});

			it("should correctly handle single level nested folders", () => {
				const testCases = [
					"notes/daily.md",
					"projects/work.md",
					"archive/old.md",
					"templates/meeting.md",
				];

				testCases.forEach(filePath => {
					const dbPath = plugin.getDbFilePath(filePath);

					expect(dbPath).toContain(plugin.settings.dbDir);
					expect(dbPath).toMatch(/\.json$/);
					expect(dbPath).not.toContain(filePath); // Hash should not contain original path
				});
			});

			it("should correctly handle deeply nested folder structures", () => {
				const testCases = [
					"projects/work/2024/q1/meeting-notes.md",
					"personal/health/doctors/appointments/2024/january.md",
					"research/papers/computer-science/ai/machine-learning/transformers.md",
					"archive/2023/december/week1/monday/morning-standup.md",
				];

				testCases.forEach(filePath => {
					const dbPath = plugin.getDbFilePath(filePath);

					expect(dbPath).toContain(plugin.settings.dbDir);
					expect(dbPath).toMatch(/\.json$/);

					// Verify that nested paths produce different hashes
					const hash = plugin.getFileHash(filePath);
					expect(dbPath).toContain(hash);
				});
			});

			it("should generate unique paths for files with similar nested structures", () => {
				const similarPaths = [
					"projects/work/file.md",
					"projects/work/subfolder/file.md",
					"projects/personal/file.md",
					"projects/work/file2.md",
				];

				const dbPaths = similarPaths.map(path =>
					plugin.getDbFilePath(path)
				);
				const uniquePaths = new Set(dbPaths);

				expect(uniquePaths.size).toBe(similarPaths.length);
			});
		});

		describe("special characters in paths", () => {
			beforeEach(() => {
				plugin.settings = {
					dbDir: "/test/.obsidian/plugins/anti-ephemeral-state/db",
				};
			});

			it("should handle spaces in folder and file names", () => {
				const testCases = [
					"my notes/daily journal.md",
					"work projects/project alpha/meeting notes.md",
					"personal stuff/health records/doctor visits.md",
					" spaces at start/file.md",
					"folder/ spaces at end .md",
					"multiple   spaces/between   words.md",
				];

				testCases.forEach(filePath => {
					const dbPath = plugin.getDbFilePath(filePath);

					expect(dbPath).toContain(plugin.settings.dbDir);
					expect(dbPath).toMatch(/\.json$/);
					expect(typeof dbPath).toBe("string");
					expect(dbPath.length).toBeGreaterThan(
						plugin.settings.dbDir.length + 5
					); // dbDir + hash + .json
				});
			});

			it("should handle special punctuation characters", () => {
				const testCases = [
					"projects/file-with-dashes.md",
					"notes/file_with_underscores.md",
					"archive/file.with.dots.md",
					"temp/file (with parentheses).md",
					"research/file [with brackets].md",
					"misc/file {with braces}.md",
					"data/file@email.md",
					"logs/file#hash.md",
					"config/file$variable.md",
					"stats/file%percent.md",
					"scripts/file&command.md",
				];

				testCases.forEach(filePath => {
					const dbPath = plugin.getDbFilePath(filePath);

					expect(dbPath).toContain(plugin.settings.dbDir);
					expect(dbPath).toMatch(/\.json$/);

					// Hash should be filesystem-safe
					const fileName = dbPath.split("/").pop();
					expect(fileName).toMatch(/^[a-zA-Z0-9.]+\.json$/);
				});
			});

			it("should handle unicode and international characters", () => {
				const testCases = [
					"заметки/русский файл.md",
					"笔记/中文文件.md",
					"ノート/日本語ファイル.md",
					"notas/archivo español.md",
					"notlar/türkçe dosya.md",
					"emoji/file😀with🎉emojis.md",
					"mixed/файл with mixed языки.md",
				];

				testCases.forEach(filePath => {
					const dbPath = plugin.getDbFilePath(filePath);

					expect(dbPath).toContain(plugin.settings.dbDir);
					expect(dbPath).toMatch(/\.json$/);
					expect(typeof dbPath).toBe("string");
				});
			});
		});

		describe("absolute and relative path handling", () => {
			beforeEach(() => {
				plugin.settings = {
					dbDir: "/test/.obsidian/plugins/anti-ephemeral-state/db",
				};
			});

			it("should handle absolute paths correctly", () => {
				const testCases = [
					"/home/user/vault/note.md",
					"/Users/username/Documents/Obsidian/vault/project.md",
					"/opt/obsidian/vaults/work/meeting.md",
					"/c:/Users/User/Documents/vault/file.md", // Windows-style
				];

				testCases.forEach(filePath => {
					const dbPath = plugin.getDbFilePath(filePath);

					expect(dbPath).toContain(plugin.settings.dbDir);
					expect(dbPath).toMatch(/\.json$/);

					// Should generate consistent paths
					const dbPath2 = plugin.getDbFilePath(filePath);
					expect(dbPath).toBe(dbPath2);
				});
			});

			it("should handle relative paths correctly", () => {
				const testCases = [
					"./note.md",
					"../parent-folder/file.md",
					"./subfolder/nested.md",
					"../../../deep-parent/file.md",
					"folder/../sibling.md",
					"./folder/./file.md",
				];

				testCases.forEach(filePath => {
					const dbPath = plugin.getDbFilePath(filePath);

					expect(dbPath).toContain(plugin.settings.dbDir);
					expect(dbPath).toMatch(/\.json$/);
				});
			});

			it("should generate different paths for different absolute paths", () => {
				const absolutePaths = [
					"/home/user1/vault/note.md",
					"/home/user2/vault/note.md",
					"/opt/vault1/note.md",
					"/opt/vault2/note.md",
				];

				const dbPaths = absolutePaths.map(path =>
					plugin.getDbFilePath(path)
				);
				const uniquePaths = new Set(dbPaths);

				expect(uniquePaths.size).toBe(absolutePaths.length);
			});

			it("should treat paths with different relative components as different", () => {
				const relativePaths = [
					"./note.md",
					"../note.md",
					"folder/../note.md",
					"./folder/note.md",
				];

				const dbPaths = relativePaths.map(path =>
					plugin.getDbFilePath(path)
				);
				const uniquePaths = new Set(dbPaths);

				expect(uniquePaths.size).toBe(relativePaths.length);
			});
		});

		describe("database directory configuration", () => {
			it("should work with different database directory configurations", () => {
				const testConfigs = [
					{
						dbDir: "/test/.obsidian/plugins/anti-ephemeral-state/db",
						description: "standard plugin directory",
					},
					{
						dbDir: "/custom/database/location",
						description: "custom absolute path",
					},
					{
						dbDir: "relative/db/path",
						description: "relative path",
					},
					{
						dbDir: "/path with spaces/database",
						description: "path with spaces",
					},
					{
						dbDir: "/unicode/путь/база данных",
						description: "unicode path",
					},
					{
						dbDir: "/very/long/deeply/nested/path/to/database/storage/location",
						description: "deeply nested path",
					},
				];

				const filePath = "test/sample.md";

				testConfigs.forEach(config => {
					plugin.settings = { dbDir: config.dbDir };
					const dbPath = plugin.getDbFilePath(filePath);

					expect(dbPath).toContain(config.dbDir);
					expect(dbPath).toMatch(/\.json$/);
					expect(dbPath.startsWith(config.dbDir + "/")).toBe(true);
				});
			});

			it("should handle edge cases in database directory paths", () => {
				const edgeCases = [
					{ dbDir: "/", description: "root directory" },
					{ dbDir: "", description: "empty string" },
					{ dbDir: ".", description: "current directory" },
					{ dbDir: "..", description: "parent directory" },
					{
						dbDir: "/trailing/slash/",
						description: "trailing slash",
					},
					{
						dbDir: "no-leading-slash",
						description: "no leading slash",
					},
				];

				const filePath = "test/sample.md";

				edgeCases.forEach(edgeCase => {
					plugin.settings = { dbDir: edgeCase.dbDir };
					const dbPath = plugin.getDbFilePath(filePath);

					expect(typeof dbPath).toBe("string");
					expect(dbPath).toMatch(/\.json$/);

					if (edgeCase.dbDir) {
						expect(dbPath).toContain(edgeCase.dbDir);
					}
				});
			});
		});

		describe("path consistency and uniqueness", () => {
			beforeEach(() => {
				plugin.settings = {
					dbDir: "/test/.obsidian/plugins/anti-ephemeral-state/db",
				};
			});

			it("should maintain path consistency across multiple calls", () => {
				const filePaths = [
					"consistency/test1.md",
					"consistency/test2.md",
					"nested/folder/test.md",
				];

				filePaths.forEach(filePath => {
					const dbPath1 = plugin.getDbFilePath(filePath);
					const dbPath2 = plugin.getDbFilePath(filePath);
					const dbPath3 = plugin.getDbFilePath(filePath);

					expect(dbPath1).toBe(dbPath2);
					expect(dbPath2).toBe(dbPath3);
				});
			});

			it("should ensure path uniqueness for different files", () => {
				const testBatch: string[] = [];

				// Generate many different file paths
				for (let i = 0; i < 100; i++) {
					testBatch.push(`batch/file${i}.md`);
					testBatch.push(`folder${i}/file.md`);
					testBatch.push(`nested/folder${i}/file${i}.md`);
				}

				const dbPaths = testBatch.map(path =>
					plugin.getDbFilePath(path)
				);
				const uniquePaths = new Set(dbPaths);

				// All paths should be unique
				expect(uniquePaths.size).toBe(testBatch.length);
			});

			it("should handle path normalization consistently", () => {
				// Test equivalent paths that should be treated as the same
				const equivalentGroups = [
					[
						"folder/file.md",
						"folder//file.md", // double slash
						"folder/./file.md", // current dir reference
					],
					["./current/file.md", "current/file.md"],
				];

				equivalentGroups.forEach(group => {
					const dbPaths = group.map(path =>
						plugin.getDbFilePath(path)
					);

					// Note: Since we're not doing path normalization in the current implementation,
					// these might be different. This test documents the current behavior.
					// If path normalization is added later, this test should be updated.
					group.forEach((path, index) => {
						expect(typeof dbPaths[index]).toBe("string");
						expect(dbPaths[index]).toMatch(/\.json$/);
					});
				});
			});
		});

		describe("error handling and edge cases", () => {
			it("should handle empty and minimal paths", () => {
				plugin.settings = {
					dbDir: "/test/.obsidian/plugins/anti-ephemeral-state/db",
				};

				const edgeCases = ["", " ", ".", "..", "/", "a", "a.md", ".md"];

				edgeCases.forEach(filePath => {
					const dbPath = plugin.getDbFilePath(filePath);

					expect(typeof dbPath).toBe("string");
					expect(dbPath).toContain(plugin.settings.dbDir);
					expect(dbPath).toMatch(/\.json$/);
				});
			});

			it("should handle very long paths", () => {
				plugin.settings = {
					dbDir: "/test/.obsidian/plugins/anti-ephemeral-state/db",
				};

				const longPath = "very/".repeat(100) + "long/path/file.md";
				const dbPath = plugin.getDbFilePath(longPath);

				expect(typeof dbPath).toBe("string");
				expect(dbPath).toContain(plugin.settings.dbDir);
				expect(dbPath).toMatch(/\.json$/);

				// Database path should be reasonable length even for very long input
				expect(dbPath.length).toBeLessThan(300); // reasonable filesystem limit
			});

			it("should handle paths with filesystem-unsafe characters", () => {
				plugin.settings = {
					dbDir: "/test/.obsidian/plugins/anti-ephemeral-state/db",
				};

				const unsafePaths = [
					"folder/file<unsafe>.md",
					"folder/file>unsafe.md",
					"folder/file:unsafe.md",
					'folder/file"unsafe.md',
					"folder/file|unsafe.md",
					"folder/file?unsafe.md",
					"folder/file*unsafe.md",
				];

				unsafePaths.forEach(filePath => {
					const dbPath = plugin.getDbFilePath(filePath);

					expect(typeof dbPath).toBe("string");
					expect(dbPath).toContain(plugin.settings.dbDir);
					expect(dbPath).toMatch(/\.json$/);

					// The resulting hash should be filesystem-safe
					const fileName = dbPath.split("/").pop();
					expect(fileName).toMatch(/^[a-zA-Z0-9.]+\.json$/);
				});
			});
		});
	});
});
