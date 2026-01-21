/**
 * Unit tests for Lock Mode components
 * - ChecksumIntegrity.getFileTimestamp
 * - ChecksumIntegrity.verifyFileIntegrity
 * - LockManager.toggleLockState
 * - TemporaryState backward compatibility defaults
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import AntiEphemeralState from "../main";
import { App, MockVault, TestUtils, MockManifest } from "./__mocks__/obsidian";

type AESCtor = new (app: App, manifest: MockManifest) => AntiEphemeralState; // constructor type without any/unknown

describe("Lock Mode – Unit", () => {
	let plugin: AntiEphemeralState;
	let app: App;
	let manifest: MockManifest;
	let mockVault: MockVault;

	beforeEach(async () => {
		app = TestUtils.createMockApp("/test/.obsidian");
		manifest = TestUtils.createMockManifest({
			id: "anti-ephemeral-state",
			name: "Anti-Ephemeral State",
			version: "1.0.0",
		});

		// Create plugin instance using a precise constructor typing (no unknown/any)
		plugin = new (AntiEphemeralState as AESCtor)(app, manifest);

		mockVault = app.vault;

		// Initialize settings with Lock Mode enabled
		plugin.DEFAULT_SETTINGS = {
			dbDir: "/test/.obsidian/plugins/anti-ephemeral-state/db",
			lockModeEnabled: true,
		};
		plugin.settings = { ...plugin.DEFAULT_SETTINGS };
	});

	afterEach(() => {
		if (mockVault?.adapter && "reset" in mockVault.adapter) {
			// Narrow to MockVaultAdapter at runtime shape

			// @ts-ignore - test utility method present on mock adapter
			mockVault.adapter.reset();
		}
	});

	describe("ChecksumIntegrity", () => {
		it("getFileTimestamp() returns mtime for existing file", async () => {
			const filePath = "notes/file-a.md";
			await mockVault.adapter.write(filePath, "# A");

			const expected = await mockVault.adapter.stat(filePath);
			expect(expected && typeof expected.mtime === "number").toBe(true);

			const integrity = plugin.getChecksumIntegrity();
			const ts = await integrity.getFileTimestamp(filePath);
			expect(ts).toBe(expected!.mtime);
		});

		it("verifyFileIntegrity() detects external modification", async () => {
			const filePath = "notes/file-b.md";
			await mockVault.adapter.write(filePath, "# B");

			const integrity = plugin.getChecksumIntegrity();
			const ts0 = await integrity.getFileTimestamp(filePath);

			// Initially matches
			await expect(
				integrity.verifyFileIntegrity(filePath, ts0)
			).resolves.toBe(true);

			// Ensure mtime resolution boundary is crossed before next write
			await plugin.delay(10);

			// Modify file to change mtime
			await mockVault.adapter.write(filePath, "# B updated");

			// Should not match now
			await expect(
				integrity.verifyFileIntegrity(filePath, ts0)
			).resolves.toBe(false);
		});
	});

	describe("LockManager", () => {
		it("toggleLockState() switches protected flag and persists timestamp", async () => {
			// Ensure Lock Mode infra is created
			await plugin.onload();

			const filePath = "notes/lock-target.md";
			await mockVault.adapter.write(filePath, "# Target");

			// Initially no state
			let state0 = await plugin.readFileState(filePath);
			expect(state0).toBeNull();

			// Lock
			await plugin.lockManager!.toggleLockState(filePath);

			const lockedState = await plugin.readFileState(filePath);
			expect(lockedState?.protected).toBe(true);
			// Timestamp should be number (acquired from adapter.stat)
			expect(typeof lockedState?.timestamp).toBe("number");

			const expectedStat = await mockVault.adapter.stat(filePath);
			expect(lockedState?.timestamp).toBe(expectedStat?.mtime ?? null);

			// Unlock
			await plugin.lockManager!.toggleLockState(filePath);
			const unlockedState = await plugin.readFileState(filePath);
			expect(unlockedState?.protected).toBe(false);
			expect(unlockedState?.timestamp).toBeNull();
		});
	});

	describe("TemporaryState backward compatibility", () => {
		it("readFileState() fills defaults for protected/timestamp and persists them", async () => {
			const filePath = "notes/backward.md";
			const dbFilePath = plugin.getDbFilePath(filePath);

			// Simulate legacy state without Lock Mode fields
			const legacy = {
				cursor: {
					start: { col: 0, line: 0 },
					end: { col: 1, line: 0 },
				},
				scroll: 42,
				viewState: { type: "markdown", file: filePath },
			};
			await mockVault.adapter.write(dbFilePath, JSON.stringify(legacy));

			const read = await plugin.readFileState(filePath);
			expect(read).not.toBeNull();
			expect(read?.protected).toBe(false);
			expect(read?.timestamp).toBeNull();

			// Ensure defaults were persisted back
			const persistedRaw = await mockVault.adapter.read(dbFilePath);
			const persisted = JSON.parse(persistedRaw) as Record<
				string,
				unknown
			>;
			expect(persisted.protected).toBe(false);
			expect(persisted.timestamp).toBeNull();
		});
	});
});
