/**
 * Basic infrastructure test to verify that our testing setup works correctly
 */

import { MockVault, App, MockVaultAdapter } from "./__mocks__/obsidian";

describe("Test Infrastructure", () => {
	describe("Basic Mock Test", () => {
		it("should create MockVault with configDir", () => {
			const configDir = "/test/.obsidian";
			const vault = new MockVault(configDir);

			expect(vault.configDir).toBe(configDir);
			expect(vault.adapter).toBeInstanceOf(MockVaultAdapter);
		});

		it("should handle file operations in MockVaultAdapter", async () => {
			const adapter = new MockVaultAdapter();
			const testPath = "test.json";
			const testContent = '{"test": true}';

			await adapter.write(testPath, testContent);
			const exists = await adapter.exists(testPath);
			expect(exists).toBe(true);

			const content = await adapter.read(testPath);
			expect(content).toBe(testContent);
		});

		it("should create App instance", () => {
			const app = new App("/test/.obsidian");
			expect(app.vault).toBeInstanceOf(MockVault);
			expect(app.vault.configDir).toBe("/test/.obsidian");
		});
	});
});
