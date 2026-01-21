/**
 * Tests for file hashing functionality in AntiEphemeralState plugin
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import AntiEphemeralState from "../main";
import { App, MockVault, TestUtils, MockManifest } from "./__mocks__/obsidian";

const createPlugin = (app: App, manifest: MockManifest): AntiEphemeralState => {
	return new AntiEphemeralState(app, manifest);
};

describe("AntiEphemeralState File Hashing", () => {
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
		if (app?.vault && app.vault.adapter) {
			app.vault.adapter.reset();
		}
	});

	describe("getFileHash", () => {
		it("should generate consistent hashes for same file names", () => {
			const filePath = "test/example.md";
			const hash1 = plugin.getFileHash(filePath);
			const hash2 = plugin.getFileHash(filePath);

			expect(hash1).toBe(hash2);
			expect(typeof hash1).toBe("string");
			expect(hash1.length).toBeGreaterThan(0);
		});

		it("should generate different hashes for different file names", () => {
			const filePath1 = "test/file1.md";
			const filePath2 = "test/file2.md";
			const hash1 = plugin.getFileHash(filePath1);
			const hash2 = plugin.getFileHash(filePath2);

			expect(hash1).not.toBe(hash2);
		});

		it("should handle simple file names", () => {
			const testCases = [
				"note.md",
				"file.txt",
				"document.pdf",
				"a.md",
				"1.md",
			];

			testCases.forEach(fileName => {
				const hash = plugin.getFileHash(fileName);
				expect(typeof hash).toBe("string");
				expect(hash.length).toBeGreaterThan(0);
			});
		});

		it("should handle file paths with subdirectories", () => {
			const testCases = [
				"folder/note.md",
				"deep/nested/folder/file.md",
				"folder1/folder2/folder3/document.md",
				"project/src/components/Header.tsx",
				"very/very/very/deep/nested/structure/file.md",
			];

			testCases.forEach(filePath => {
				const hash = plugin.getFileHash(filePath);
				expect(typeof hash).toBe("string");
				expect(hash.length).toBeGreaterThan(0);
			});
		});

		it("should handle unicode characters correctly", () => {
			const testCases = [
				"русский.md",
				"中文文件.md",
				"日本語.md",
				"emoji😀.md",
				"сложный/путь/к/файлу.md",
				"测试/文件/路径.md",
				"مجلد/ملف.md",
			];

			testCases.forEach(filePath => {
				const hash = plugin.getFileHash(filePath);
				expect(typeof hash).toBe("string");
				expect(hash.length).toBeGreaterThan(0);
			});
		});

		it("should handle special characters in file names", () => {
			const testCases = [
				"file with spaces.md",
				"file-with-dashes.md",
				"file_with_underscores.md",
				"file.with.dots.md",
				"file (with parentheses).md",
				"file [with brackets].md",
				"file {with braces}.md",
				"file@symbol.md",
				"file#hash.md",
				"file$dollar.md",
				"file%percent.md",
				"file&ampersand.md",
			];

			testCases.forEach(filePath => {
				const hash = plugin.getFileHash(filePath);
				expect(typeof hash).toBe("string");
				expect(hash.length).toBeGreaterThan(0);
			});
		});

		it("should handle edge cases", () => {
			const testCases = [
				"", // empty string
				"a", // single character
				"/", // just slash
				".", // just dot
				"..", // double dot
				"./file.md", // relative path
				"../file.md", // parent directory
				"/absolute/path/file.md", // absolute path
				"\\windows\\path\\file.md", // Windows-style path
			];

			testCases.forEach(filePath => {
				const hash = plugin.getFileHash(filePath);
				expect(typeof hash).toBe("string");
				expect(hash.length).toBeGreaterThan(0);
			});
		});

		it("should maintain low collision rate", () => {
			// Generate a set of similar file names and check for collisions
			const testFiles: string[] = [];
			for (let i = 0; i < 1000; i++) {
				testFiles.push(`file${i}.md`);
				testFiles.push(`folder${i}/file.md`);
				testFiles.push(`file${i}${i}.md`);
			}

			const hashes = new Set();
			let collisions = 0;

			testFiles.forEach(fileName => {
				const hash = plugin.getFileHash(fileName);
				if (hashes.has(hash)) {
					collisions++;
				} else {
					hashes.add(hash);
				}
			});

			// Collision rate should be very low (less than 1%)
			const collisionRate = collisions / testFiles.length;
			expect(collisionRate).toBeLessThan(0.01);
		});

		it("should handle very long file names", () => {
			// Test with increasingly long file names
			const baseName = "very_long_file_name_that_keeps_getting_longer";
			const testCases = [
				baseName.repeat(1) + ".md",
				baseName.repeat(5) + ".md",
				baseName.repeat(10) + ".md",
				baseName.repeat(20) + ".md",
				baseName.repeat(50) + ".md",
			];

			testCases.forEach(fileName => {
				const hash = plugin.getFileHash(fileName);
				expect(typeof hash).toBe("string");
				expect(hash.length).toBeGreaterThan(0);
			});

			// All hashes should be different
			const hashes = testCases.map(fileName =>
				plugin.getFileHash(fileName)
			);
			const uniqueHashes = new Set(hashes);
			expect(uniqueHashes.size).toBe(testCases.length);
		});

		it("should produce hashes that are valid for file names", () => {
			const testCases = [
				"normal/file.md",
				"file with spaces.md",
				"специальные/символы.md",
			];

			testCases.forEach(filePath => {
				const hash = plugin.getFileHash(filePath);

				// Hash should not contain characters that are invalid in file names
				expect(hash).not.toMatch(/[<>:"|?*\\/]/);

				// Hash should be alphanumeric with possible dots
				expect(hash).toMatch(/^[a-zA-Z0-9.]+$/);
			});
		});

		it("should use length as part of hash for extra uniqueness", () => {
			// Files with same character set but different lengths should have different hashes
			const file1 = "abc";
			const file2 = "abcc";
			const file3 = "abccc";

			const hash1 = plugin.getFileHash(file1);
			const hash2 = plugin.getFileHash(file2);
			const hash3 = plugin.getFileHash(file3);

			expect(hash1).not.toBe(hash2);
			expect(hash2).not.toBe(hash3);
			expect(hash1).not.toBe(hash3);
		});

		it("should handle boundary values for hash calculation", () => {
			// Test with characters at Unicode boundaries
			const testCases = [
				String.fromCharCode(0), // null character
				String.fromCharCode(127), // DEL character
				String.fromCharCode(255), // extended ASCII
				String.fromCharCode(65535), // max 16-bit value
				String.fromCharCode(0x1f600), // emoji
			];

			testCases.forEach(char => {
				const fileName = `file${char}.md`;
				const hash = plugin.getFileHash(fileName);
				expect(typeof hash).toBe("string");
				expect(hash.length).toBeGreaterThan(0);
			});
		});
	});

	describe("getDbFilePath", () => {
		it("should generate database file paths correctly", () => {
			// Set up plugin settings first
			plugin.settings = {
				dbDir: "/test/.obsidian/plugins/anti-ephemeral-state/db",
			};

			const filePath = "test/example.md";
			const dbPath = plugin.getDbFilePath(filePath);

			expect(dbPath).toContain(plugin.settings.dbDir);
			expect(dbPath).toMatch(/\.json$/);
		});

		it("should generate different paths for different files", () => {
			// Set up plugin settings first
			plugin.settings = {
				dbDir: "/test/.obsidian/plugins/anti-ephemeral-state/db",
			};

			const filePath1 = "test/file1.md";
			const filePath2 = "test/file2.md";
			const dbPath1 = plugin.getDbFilePath(filePath1);
			const dbPath2 = plugin.getDbFilePath(filePath2);

			expect(dbPath1).not.toBe(dbPath2);
			expect(dbPath1).toContain(plugin.settings.dbDir);
			expect(dbPath2).toContain(plugin.settings.dbDir);
		});

		it("should work with various database directory paths", () => {
			const testDbDirs = [
				"/test/.obsidian/plugins/anti-ephemeral-state/db",
				"/custom/path/to/db",
				"relative/path/db",
				"/path with spaces/db",
				"/unicode/путь/db",
			];

			const filePath = "test/file.md";

			testDbDirs.forEach(dbDir => {
				plugin.settings = { dbDir };
				const dbPath = plugin.getDbFilePath(filePath);

				expect(dbPath).toContain(dbDir);
				expect(dbPath).toMatch(/\.json$/);
			});
		});

		it("should handle complex file paths correctly", () => {
			plugin.settings = {
				dbDir: "/test/.obsidian/plugins/anti-ephemeral-state/db",
			};

			const testCases = [
				"simple.md",
				"folder/nested.md",
				"very/deep/nested/structure/file.md",
				"file with spaces.md",
				"специальные символы.md",
				"emoji😀file.md",
			];

			testCases.forEach(filePath => {
				const dbPath = plugin.getDbFilePath(filePath);
				expect(dbPath).toContain(plugin.settings.dbDir);
				expect(dbPath).toMatch(/\.json$/);
			});
		});

		it("should maintain consistent mapping between file and database paths", () => {
			plugin.settings = {
				dbDir: "/test/.obsidian/plugins/anti-ephemeral-state/db",
			};

			const filePath = "test/consistent.md";
			const dbPath1 = plugin.getDbFilePath(filePath);
			const dbPath2 = plugin.getDbFilePath(filePath);

			expect(dbPath1).toBe(dbPath2);
		});
	});
});
