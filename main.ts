import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	MarkdownView,
	TAbstractFile,
	Editor,
	debounce,
	Notice,
	setTooltip,
} from "obsidian";

import type { ViewState, Debouncer } from "obsidian";

interface PluginSettings {
	dbDir: string;
	// Whether Lock Mode UI and behavior is enabled
	lockModeEnabled?: boolean; // default true
}

const DELAY_WRITING_DB = 500;

interface TemporaryState {
	cursor?: {
		start: {
			col: number;
			line: number;
		};
		end: {
			col: number;
			line: number;
		};
	};
	scroll?: number;
	viewState?: ViewState; // Store the complete view state from getState()
	// Lock Mode fields (backward-compatible)
	// When missing, defaults are applied during read/write: protected=false, timestamp=null
	protected?: boolean; // whether note is protected from edits
	timestamp?: number | null; // file mtime in ms; null when unknown
}

/** Minimal shape we rely on from persisted JSON */
interface MinimalViewState {
	file?: string;
}
interface ParsedStateMinimal {
	viewState?: MinimalViewState;
}
function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null;
}
function isParsedStateMinimal(v: unknown): v is ParsedStateMinimal {
	if (!isObject(v)) return false;
	const vs = v.viewState;
	if (vs === undefined) return true; // viewState is optional
	if (!isObject(vs)) return false;
	const file = vs.file;
	return file === undefined || typeof file === "string";
}

export default class AntiEphemeralState extends Plugin {
	settings: PluginSettings;
	DEFAULT_SETTINGS: PluginSettings; // declare as public class property
	lastTemporaryState: TemporaryState | null = null;
	lastLoadedFileName: string;
	loadingFile = false;
	lastEventTime = 0;
	debouncedSave: Debouncer<[string, TemporaryState], void>;
	scrollListenersAttached = false; // Track if scroll listeners are already attached
	restorationPromise: Promise<void> | null = null; // Promise to track restoration completion
	private lockStatusBar?: LockStatusBar; // status bar controller when Lock Mode enabled
	private checksumIntegrity?: ChecksumIntegrity; // integrity helper
	lockManager?: LockManager; // lock manager controller
	// Command registration state for Lock Mode toggle
	private lockCommandId = "lock-unlock";
	private lockCommandRegistered = false;

	// Improved hash function for file names with better collision resistance
	getFileHash(filePath: string): string {
		// Use a more robust hashing approach with multiple hash values
		let hash1 = 0;
		let hash2 = 0;
		const prime1 = 31;
		const prime2 = 37;

		for (let i = 0; i < filePath.length; i++) {
			const char = filePath.charCodeAt(i);
			hash1 = (hash1 * prime1 + char) & 0x7fffffff; // Keep positive
			hash2 = (hash2 * prime2 + char) & 0x7fffffff; // Keep positive
		}

		// Combine both hashes and add file length for extra uniqueness
		const combined =
			hash1.toString(36) +
			hash2.toString(36) +
			filePath.length.toString(36);
		return combined;
	}

	// Resolve per-file state storage path (database file) for a specific note
	getDbFilePath(filePath: string): string {
		const hash = this.getFileHash(filePath);
		return `${this.settings.dbDir}/${hash}.json`;
	}

	// Read state from the per-file database (state store)
	async readFileState(filePath: string): Promise<TemporaryState | null> {
		try {
			const dbFilePath = this.getDbFilePath(filePath);
			if (await this.app.vault.adapter.exists(dbFilePath)) {
				let data = await this.app.vault.adapter.read(dbFilePath);

				// Private validation function for viewState.file field
				const validateViewStateFile = (
					parsedData: unknown,
					expectedFilePath: string
				): boolean => {
					if (!isParsedStateMinimal(parsedData)) return true; // if structure unknown, don't invalidate
					const fileVal = parsedData.viewState?.file;
					if (
						typeof fileVal === "string" &&
						fileVal !== expectedFilePath
					) {
						return false;
					}
					return true;
				};

				const parsedData = JSON.parse(data);

				// Ensure Lock Mode fields have defaults for backward compatibility
				const ensureLockDefaults = (obj: unknown): boolean => {
					if (!isObject(obj)) return false;
					let changed = false;
					const rec = obj;
					if (typeof rec.protected !== "boolean") {
						rec.protected = false;
						changed = true;
					}
					const ts = rec.timestamp;
					if (
						ts === undefined ||
						(typeof ts !== "number" && ts !== null)
					) {
						rec.timestamp = null;
						changed = true;
					}
					return changed;
				};

				let changedDefaults = ensureLockDefaults(parsedData);

				// Validate viewState.file field
				if (!validateViewStateFile(parsedData, filePath)) {
					// Update the invalid viewState.file field immediately
					if (parsedData.viewState) {
						parsedData.viewState.file = filePath;
					}
					// Save the corrected data back to the file (also persists defaults)
					await this.app.vault.adapter.write(
						dbFilePath,
						JSON.stringify(parsedData)
					);
					// Return the corrected data
					return parsedData;
				}

				let containsFlashingSpan =
					this.app.workspace.containerEl.querySelector(
						"span.is-flashing"
					);
				if (!containsFlashingSpan) {
					// Persist defaults if they were added and file path was valid
					if (changedDefaults) {
						await this.app.vault.adapter.write(
							dbFilePath,
							JSON.stringify(parsedData)
						);
					}
					return parsedData;
				} else {
					return null;
				}
			}
		} catch (e) {
			console.error("[AES] Error reading file state:", e);
		}
		return null;
	}

	// Write state to the per-file database (state store)
	async writeFileState(
		filePath: string,
		state: TemporaryState
	): Promise<void> {
		try {
			const dbFilePath = this.getDbFilePath(filePath);

			// Ensure database directory exists (state persistence root)
			if (!(await this.app.vault.adapter.exists(this.settings.dbDir))) {
				await this.app.vault.adapter.mkdir(this.settings.dbDir);
			}

			// Apply defaults for new fields before saving (non-destructive merge)
			const stateToSave: TemporaryState = { ...state };
			if (typeof stateToSave.protected !== "boolean") {
				stateToSave.protected = false;
			}
			const ts = stateToSave.timestamp;
			if (ts === undefined || (typeof ts !== "number" && ts !== null)) {
				stateToSave.timestamp = null;
			}

			await this.app.vault.adapter.write(
				dbFilePath,
				JSON.stringify(stateToSave)
			);
			console.debug("[AES] State saved to database file:", dbFilePath);
		} catch (e) {
			console.error("[AES] Error writing file state:", e);
		}
	}

	// Validate entire database directory: fix wrong viewState.file, remove DB entries for missing notes
	async validateDatabase(): Promise<void> {
		const dbDir = this.settings.dbDir;
		let total = 0;
		let fixedViewStatePath = 0;
		let removedMissingNote = 0;
		let removedInvalidEntry = 0;
		let errors = 0;

		try {
			// Ensure database directory exists
			if (!(await this.app.vault.adapter.exists(dbDir))) {
				new Notice("[AES] Validation: database directory not found");
				return;
			}

			// Read directory listing
			const entries = await this.app.vault.adapter.list(dbDir);
			const files = (entries.files || []).filter(f =>
				f.toLowerCase().endsWith(".json")
			);

			for (const dbFilePath of files) {
				total++;

				try {
					const raw = await this.app.vault.adapter.read(dbFilePath);
					let parsed: unknown;
					try {
						parsed = JSON.parse(raw);
					} catch {
						// Invalid JSON -> remove
						await this.app.vault.adapter.remove(dbFilePath);
						removedInvalidEntry++;
						continue;
					}

					// Determine note path from viewState.file if present
					let notePath: string | undefined = undefined;
					if (isParsedStateMinimal(parsed)) {
						const fileVal = parsed.viewState?.file;
						if (typeof fileVal === "string") {
							notePath = fileVal;
						}
					}

					if (!notePath) {
						// Cannot correlate DB entry to a note -> remove
						await this.app.vault.adapter.remove(dbFilePath);
						removedInvalidEntry++;
						continue;
					}

					// Optional: validate and fix wrong viewState.file (should equal notePath itself after decision)
					// Here we mirror logic from readFileState(): the expected path for the state is exactly notePath.
					// If the JSON was produced for a different file and moved, we correct to notePath (self-consistent).
					let changed = false;
					if (isParsedStateMinimal(parsed)) {
						if (parsed.viewState?.file !== notePath) {
							// ensure container objects exist before assignment
							if (!parsed.viewState) parsed.viewState = {};
							parsed.viewState.file = notePath;
							changed = true;
						}
					}

					// Check whether the note actually exists
					const exists =
						await this.app.vault.adapter.exists(notePath);
					if (!exists) {
						// Remove DB file if corresponding note is missing
						await this.app.vault.adapter.remove(dbFilePath);
						removedMissingNote++;
						continue;
					}

					// If we changed anything in the JSON, write back
					if (changed) {
						await this.app.vault.adapter.write(
							dbFilePath,
							JSON.stringify(parsed)
						);
						fixedViewStatePath++;
					}
				} catch (e) {
					console.error(
						"[AES] Validation error for DB file:",
						dbFilePath,
						e
					);
					errors++;
				}
			}

			new Notice(
				`[AES] Validation completed. Total: ${total}, fixed viewState.file: ${fixedViewStatePath}, removed missing notes: ${removedMissingNote}, removed invalid: ${removedInvalidEntry}, errors: ${errors}`
			);
			console.debug("[AES] Validation report", {
				total,
				fixedViewStatePath,
				removedMissingNote,
				removedInvalidEntry,
				errors,
			});
		} catch (e) {
			console.error("[AES] Error validating database directory:", e);
			new Notice("[AES] Validation failed. See console.");
		}
	}

	async onload() {
		// Initialize DEFAULT_SETTINGS with access to this.app
		this.DEFAULT_SETTINGS = {
			dbDir:
				this.app.vault.configDir + "/plugins/anti-ephemeral-state/db",
			lockModeEnabled: true,
		};

		await this.loadSettings();

		// Ensure database directory exists (state persistence root)
		try {
			if (!(await this.app.vault.adapter.exists(this.settings.dbDir))) {
				await this.app.vault.adapter.mkdir(this.settings.dbDir);
				console.debug(
					"[AES] Created database directory:",
					this.settings.dbDir
				);
			}
		} catch (e) {
			console.error("[AES] Error creating database directory:", e);
		}

		this.addSettingTab(new SettingTab(this.app, this));

		// Initialize Lock Mode status bar
		if (this.settings.lockModeEnabled !== false) {
			this.lockStatusBar = new LockStatusBar(this);
			this.checksumIntegrity = new ChecksumIntegrity(this);
			this.lockManager = new LockManager(this);
			this.registerLockCommand();
		}

		this.registerEvent(
			this.app.workspace.on("file-open", file => {
				if (!file) return;

				this.loadingFile = true;
				this.lastLoadedFileName = file.path;

				// Use layout-change event to ensure DOM is ready
				const layoutChangeHandler = async () => {
					// Get the current active file instead of using the file from closure
					const activeLeaf =
						this.app.workspace.getActiveViewOfType(MarkdownView);
					const currentFile = activeLeaf?.file;

					// Only proceed if current file matches the file that triggered the event
					if (!currentFile || currentFile.path !== file.path) {
						console.debug(
							"[AES] Layout change - file mismatch, expected:",
							file.path,
							"current:",
							currentFile?.path,
							"- skipping restoration"
						);
						this.loadingFile = false;
						this.app.workspace.off(
							"layout-change",
							layoutChangeHandler
						);
						return;
					}

					const state = await this.readFileState(file.path);
					console.debug(
						"[AES] Layout change detected for file:",
						file.path,
						"State found:",
						!!state
					);
					if (state) {
						// Integrity check with mtime if Lock Mode is enabled and timestamp is present
						let integrityMismatch = false;
						if (
							this.settings.lockModeEnabled !== false &&
							this.checksumIntegrity &&
							typeof state.timestamp === "number"
						) {
							try {
								const ok =
									await this.checksumIntegrity.verifyFileIntegrity(
										file.path,
										state.timestamp
									);
								if (!ok) {
									integrityMismatch = true;
									console.warn(
										"[AES] Integrity mismatch detected for",
										file.path
									);
								}
							} catch (e) {
								console.error(
									"[AES] Integrity check failed:",
									e
								);
							}
						}

						// Update lock icon according to saved state and integrity
						if (this.lockStatusBar) {
							const iconState = integrityMismatch
								? "corrupted"
								: state.protected
									? "locked"
									: "unlocked";
							this.lockStatusBar.updateIcon(iconState);
						}
						console.debug(
							"[AES] Attempting to restore position:",
							state
						);
						if (activeLeaf) {
							await this.app.workspace.revealLeaf(
								activeLeaf.leaf
							);
							console.debug(
								"[AES] Calling setTemporaryState directly with state:",
								state
							);
							this.setTemporaryState(state);
						}
						this.loadingFile = false;
					} else {
						console.debug(
							"[AES] No saved state found for file:",
							file.path
						);
						// No state -> show unlocked icon
						if (this.lockStatusBar) {
							this.lockStatusBar.updateIcon("unlocked");
						}
						this.loadingFile = false;
					}
					// Remove the one-time handler
					this.app.workspace.off(
						"layout-change",
						layoutChangeHandler
					);
				};

				// Register one-time layout-change handler
				this.app.workspace.on("layout-change", layoutChangeHandler);
			})
		);

		// No need for quit handler since we save immediately

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				void this.renameFile(file, oldPath);
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", file => {
				void this.deleteFile(file);
			})
		);

		// Event-driven approach: listen to editor changes
		this.registerEvent(
			this.app.workspace.on("editor-change", () => this.onEditorChange())
		);

		// Listen to layout changes for scroll events
		this.registerEvent(
			this.app.workspace.on("layout-change", () => this.onLayoutChange())
		);

		// Listen to active leaf changes
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.onActiveLeafChange();
			})
		);

		// Setup DOM event listeners for scroll and cursor events
		this.setupDOMEventListeners();

		// Initialize debounced save function using Obsidian's debounce
		this.debouncedSave = debounce(
			(filePath: string, state: TemporaryState) => {
				void this.writeFileState(filePath, state);
			},
			DELAY_WRITING_DB,
			true
		);

		void this.restoreTemporaryState();
	}

	async renameFile(file: TAbstractFile, oldPath: string) {
		try {
			// Read state from old database file
			const oldState = await this.readFileState(oldPath);
			if (oldState) {
				// Write to new database file
				await this.writeFileState(file.path, oldState);
				// Delete old database file
				const oldDbFilePath = this.getDbFilePath(oldPath);
				if (await this.app.vault.adapter.exists(oldDbFilePath)) {
					await this.app.vault.adapter.remove(oldDbFilePath);
				}
			}
		} catch (e) {
			console.error("[AES] Error renaming file database:", e);
		}
	}

	async deleteFile(file: TAbstractFile) {
		try {
			const dbFilePath = this.getDbFilePath(file.path);
			if (await this.app.vault.adapter.exists(dbFilePath)) {
				await this.app.vault.adapter.remove(dbFilePath);
				console.debug("[AES] Deleted database file for:", file.path);
			}
		} catch (e) {
			console.error("[AES] Error deleting file database:", e);
		}
	}

	// Event handlers for the new event-driven approach
	onEditorChange() {
		this.checkTemporaryStateChanged();
	}

	onLayoutChange() {
		this.checkTemporaryStateChanged();
	}

	onActiveLeafChange() {
		this.checkTemporaryStateChanged();
	}

	// Setup DOM event listeners for scroll and cursor events
	setupDOMEventListeners() {
		// Listen to mouse events for cursor position changes
		this.registerDomEvent(document, "mouseup", () => {
			this.checkTemporaryStateChanged();
		});

		// Listen to keyboard events for cursor position changes
		this.registerDomEvent(document, "keyup", evt => {
			// Only track navigation keys and selection changes
			if (
				[
					"ArrowUp",
					"ArrowDown",
					"ArrowLeft",
					"ArrowRight",
					"Home",
					"End",
					"PageUp",
					"PageDown",
				].includes(evt.key)
			) {
				this.checkTemporaryStateChanged();
			}
		});

		// Setup scroll event listeners on workspace container
		this.setupScrollEventListeners();
	}

	// Setup scroll event listeners on the workspace container
	setupScrollEventListeners() {
		// Wait for workspace to be ready, then attach scroll listeners
		this.app.workspace.onLayoutReady(() => {
			this.attachScrollListeners();
		});
	}

	// Attach scroll listeners to the appropriate DOM elements
	attachScrollListeners() {
		// Prevent multiple attachments
		if (this.scrollListenersAttached) {
			console.debug("[AES] Scroll listeners already attached, skipping");
			return;
		}

		// Find the main workspace container
		const workspaceEl = document.querySelector(".workspace");
		if (workspaceEl) {
			console.debug("[AES] Attaching scroll listener to workspace");
			this.registerDomEvent(
				workspaceEl as HTMLElement,
				"scroll",
				() => {
					this.checkTemporaryStateChanged();
				},
				{ passive: true, capture: true }
			);
		}

		// Also listen to scroll events on the main content area
		const contentEl = document.querySelector(".workspace-leaf-content");
		if (contentEl) {
			console.debug("[AES] Attaching scroll listener to content area");
			this.registerDomEvent(
				contentEl as HTMLElement,
				"scroll",
				() => {
					this.checkTemporaryStateChanged();
				},
				{ passive: true, capture: true }
			);
		}

		// Listen to scroll events on the editor container specifically
		const editorEl = document.querySelector(".cm-editor");
		if (editorEl) {
			console.debug("[AES] Attaching scroll listener to editor");
			this.registerDomEvent(
				editorEl as HTMLElement,
				"scroll",
				() => {
					this.checkTemporaryStateChanged();
				},
				{ passive: true, capture: true }
			);
		}

		// Fallback: listen to scroll events on document body
		this.registerDomEvent(
			document.body,
			"scroll",
			() => {
				this.checkTemporaryStateChanged();
			},
			{ passive: true, capture: true }
		);

		// Mark listeners as attached
		this.scrollListenersAttached = true;
		console.debug("[AES] All scroll listeners attached successfully");
	}

	// Override onunload to cleanup
	onunload() {
		// Cancel any pending debounced save
		if (this.debouncedSave) {
			this.debouncedSave.cancel();
		}
		// Reset scroll listeners flag for clean reload
		this.scrollListenersAttached = false;
		this.unregisterLockCommand();
		// No need for final save since we save immediately
		super.onunload();
	}

	checkTemporaryStateChanged() {
		requestAnimationFrame(() => {
			void (async () => {
				// Wait for any ongoing restoration to complete
				if (this.restorationPromise) {
					await this.restorationPromise;
				}
				// Minimal lock-mode enforcement hook before we compute/save state
				const activePath = this.app.workspace.getActiveFile()?.path;
				if (
					activePath &&
					this.settings.lockModeEnabled !== false &&
					this.lockManager
				) {
					try {
						await this.lockManager.enforceReadOnlyMode(activePath);
					} catch (e) {
						console.warn("[AES] enforceReadOnlyMode failed:", e);
					}
				}

				this.performStateCheck();
			})();
		});
	}

	performStateCheck() {
		let fileName = this.app.workspace.getActiveFile()?.path;

		// waiting for the new file to finish loading
		if (
			!fileName ||
			!this.lastLoadedFileName ||
			fileName != this.lastLoadedFileName ||
			this.loadingFile
		)
			return;

		let state = this.getTemporaryState();

		// Don't save empty/meaningless states
		const isEmptyState = (state: TemporaryState) => {
			return (
				Object.keys(state).length === 0 ||
				(!state.cursor && !state.scroll && !state.viewState)
			);
		};

		if (isEmptyState(state)) {
			console.debug("[AES] Skipping save of empty state");
			return;
		}

		if (!this.lastTemporaryState) this.lastTemporaryState = state;

		if (!this.TemporaryStatesSame(state, this.lastTemporaryState)) {
			this.saveTemporaryState(state);
			// Update last known state
			this.lastTemporaryState = state;
		}
	}

	TemporaryStatesSame(
		left: TemporaryState | null,
		right: TemporaryState | null
	): boolean {
		// Handle null/empty states
		if (!left && !right) return true;
		if (!left || !right) return false;

		// Check if both states are effectively empty
		const isEmptyState = (state: TemporaryState) => {
			return (
				Object.keys(state).length === 0 ||
				(!state.cursor && !state.scroll && !state.viewState)
			);
		};

		const leftEmpty = isEmptyState(left);
		const rightEmpty = isEmptyState(right);

		if (leftEmpty && rightEmpty) return true;
		if (leftEmpty !== rightEmpty) return false;
		// Cursor presence symmetry
		const leftHasCursor = !!left.cursor;
		const rightHasCursor = !!right.cursor;
		if (leftHasCursor !== rightHasCursor) return false;

		// Cursor comparing
		if (leftHasCursor) {
			const lc = left.cursor!;
			const rc = right.cursor!;
			if (lc.start.col !== rc.start.col) return false;
			if (lc.start.line !== rc.start.line) return false;
			if (lc.end.col !== rc.end.col) return false;
			if (lc.end.line !== rc.end.line) return false;
		}

		// Scroll presence symmetry
		const leftHasScroll = !!left.scroll;
		const rightHasScroll = !!right.scroll;
		if (leftHasScroll !== rightHasScroll) return false;

		// Scroll equality
		if (leftHasScroll && left.scroll !== right.scroll) return false;

		// View state deep structural equality via JSON representation
		if (JSON.stringify(left.viewState) !== JSON.stringify(right.viewState))
			return false;

		return true;
	}

	async saveTemporaryState(state: TemporaryState) {
		let fileName = this.app.workspace.getActiveFile()?.path;
		console.debug(
			"[AES] saveTemporaryState called, fileName:",
			fileName,
			"lastLoadedFileName:",
			this.lastLoadedFileName
		);
		if (fileName && fileName == this.lastLoadedFileName) {
			//do not save if file changed or was not loaded
			console.debug(
				"[AES] Saving state for file:",
				fileName,
				"State:",
				state
			);
			// Preserve Lock Mode fields from existing persisted state to avoid accidental overwrite
			let merged: TemporaryState = state;
			try {
				const existing = await this.readFileState(fileName);
				if (existing) {
					merged = {
						...existing, // keep protected/timestamp and previous fields
						...state, // override cursor/scroll/viewState from fresh capture
					};
					// Explicitly carry over lock fields if present to avoid undefined defaults
					if (typeof existing.protected === "boolean") {
						merged.protected = existing.protected;
					}
					if (
						existing.timestamp === null ||
						typeof existing.timestamp === "number"
					) {
						merged.timestamp = existing.timestamp;
					}
				} else if (this.lastTemporaryState) {
					// Use in-memory last state as a fallback source of lock fields
					merged = {
						...state,
						protected: this.lastTemporaryState.protected,
						timestamp: this.lastTemporaryState.timestamp,
					};
				}
			} catch (e) {
				console.warn(
					"[AES] Failed to merge existing state, proceeding:",
					e
				);
			}

			// Use debounced save to prevent excessive state file writes
			this.debouncedSave(fileName, merged);
		} else {
			console.debug(
				"[AES] Cannot save state - file changed or not loaded properly"
			);
		}
	}

	async restoreTemporaryState() {
		this.restorationPromise = this.performRestoration();
		await this.restorationPromise;
		this.restorationPromise = null;
	}

	private async performRestoration() {
		try {
			await this.restoreTemporaryStateWithRetry(5);
		} catch (error) {
			console.error(
				"[AES] Failed to restore temporary state after all retries:",
				error
			);
			// Show user notification about restoration failure
			new Notice(
				"[AES] Failed to restore note state. Try reopening the note.",
				3000
			);
			// Reset loading state to prevent getting stuck
			this.loadingFile = false;
			// Set restorationPromise to a resolved promise to prevent further operations
			this.restorationPromise = Promise.resolve();
		}
	}

	private async restoreTemporaryStateWithRetry(
		maxAttempts: number
	): Promise<void> {
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				let fileName = this.app.workspace.getActiveFile()?.path;
				// Check if we have a valid file name
				if (!fileName) {
					if (attempt < maxAttempts) {
						const delayMs = 10 * Math.pow(2, attempt - 1);
						console.debug(
							`[AES] Attempt ${attempt}/${maxAttempts}: No active file found, retrying in ${delayMs}ms`
						);
						await this.delay(delayMs);
						continue;
					} else {
						console.warn(
							"[AES] No active file found after all retry attempts"
						);
						return;
					}
				}

				console.debug(
					`[AES] Attempt ${attempt}/${maxAttempts} - restoreTemporaryState called for file:`,
					fileName,
					"loadingFile:",
					this.loadingFile,
					"lastLoadedFileName:",
					this.lastLoadedFileName
				);

				if (
					fileName &&
					this.loadingFile &&
					this.lastLoadedFileName == fileName
				) {
					//if already started loading
					console.debug("[AES] Already loading this file, skipping");
					return;
				}

				// Simplified logic without leaf tracking to avoid API compatibility issues
				this.loadingFile = true;

				if (this.lastLoadedFileName != fileName) {
					console.debug(
						"[AES] New file detected, preparing for state load"
					);
					this.lastTemporaryState = null;
					this.lastLoadedFileName = fileName;

					let state: TemporaryState | null = null;

					if (fileName) {
						state = await this.readFileState(fileName);
						console.debug(
							"[AES] Found state in database for file:",
							fileName,
							"State:",
							state
						);
						if (state) {
							console.debug(
								"[AES] Calling setTemporaryState with:",
								state
							);
							this.setTemporaryState(state);
						} else {
							console.debug(
								"[AES] No state found in database for file:",
								fileName
							);
						}
					}
					this.lastTemporaryState = state || null;
				} else {
					console.debug("[AES] Same file as before, not restoring");
				}

				this.loadingFile = false;
				console.debug(
					`[AES] restoreTemporaryState completed successfully on attempt ${attempt}`
				);
				return; // Success, exit retry loop
			} catch (error) {
				console.error(
					`[AES] Attempt ${attempt}/${maxAttempts} failed:`,
					error
				);
				if (attempt < maxAttempts) {
					const delayMs = 10 * Math.pow(2, attempt - 1);
					console.debug(`[AES] Retrying in ${delayMs}ms...`);
					await this.delay(delayMs);
				} else {
					// Reset loading state on final failure
					this.loadingFile = false;
					throw error;
				}
			}
		}
	}

	getTemporaryState(): TemporaryState {
		let state: TemporaryState = {};
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (view) {
			// Get the complete view state using official API
			const viewState = view.getState();
			state.viewState = { ...viewState, type: view.getViewType() };

			// Get scroll position with better error handling
			const scrollPos = view.currentMode?.getScroll();
			if (
				scrollPos !== undefined &&
				scrollPos !== null &&
				!isNaN(scrollPos)
			) {
				state.scroll = Number(scrollPos.toFixed(4));
				console.debug("[AES] Current scroll position:", state.scroll);
			} else {
				console.debug(
					"[AES] Could not get scroll position from view.currentMode"
				);
				// Try alternative method using editor scroll info
				const editor = this.getEditor();
				if (editor) {
					const scrollInfo = editor.getScrollInfo();
					if (scrollInfo && scrollInfo.top) {
						state.scroll = Number(scrollInfo.top.toFixed(4));
						console.debug(
							"[AES] Got scroll from editor.getScrollInfo():",
							state.scroll
						);
					}
				}
			}
			console.debug("[AES] Current view state:", state.viewState);
		}

		let editor = this.getEditor();
		if (editor) {
			let start = editor.getCursor("anchor");
			let end = editor.getCursor("head");
			if (start && end) {
				state.cursor = {
					start: {
						col: start.ch,
						line: start.line,
					},
					end: {
						col: end.ch,
						line: end.line,
					},
				};
			}
		}

		return state;
	}

	setTemporaryState(state: TemporaryState) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		console.debug(
			"[AES] setTemporaryState called with state:",
			state,
			"View found:",
			!!view
		);

		// Restore view state if it was persisted
		if (view && state.viewState) {
			console.debug("[AES] Restoring view state:", state.viewState);
			void view.setState(state.viewState, { history: false });
		}

		// Defer cursor and scroll restoration until the layout is fully ready
		this.app.workspace.onLayoutReady(() => {
			if (state.cursor) {
				const editor = this.getEditor();
				if (editor) {
					console.debug(
						"[AES] Setting cursor position:",
						state.cursor
					);
					const start = {
						ch: state.cursor.start.col,
						line: state.cursor.start.line,
					};
					const end = {
						ch: state.cursor.end.col,
						line: state.cursor.end.line,
					};
					editor.setSelection(start, end);
				} else {
					console.debug(
						"[AES] No editor found for cursor positioning"
					);
				}
			}

			if (view && state.scroll !== undefined) {
				console.debug("[AES] Setting scroll position:", state.scroll);
				// Use requestAnimationFrame to defer scroll operations and prevent measure loops
				requestAnimationFrame(() => {
					view.setEphemeralState(state);
					// Verify scroll position was set correctly with retry mechanism
					void this.verifyAndRetryScroll(
						view,
						state.scroll!,
						0
					).catch(e =>
						console.warn("[AES] verifyAndRetryScroll failed:", e)
					);
				});
			} else if (!view) {
				console.debug(
					"[AES] No MarkdownView found for scroll positioning"
				);
			}
		});
	}

	private getEditor(): Editor | undefined {
		return this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
	}

	// Public accessors for internal components used by LockManager
	getLockStatusBar(): LockStatusBar | undefined {
		return this.lockStatusBar;
	}

	getChecksumIntegrity(): ChecksumIntegrity {
		if (!this.checksumIntegrity) {
			this.checksumIntegrity = new ChecksumIntegrity(this);
		}
		return this.checksumIntegrity;
	}

	// Enable Lock Mode UI live (create status bar if missing)
	enableLockMode(): void {
		if (!this.lockStatusBar) {
			this.lockStatusBar = new LockStatusBar(this);
		}
		this.registerLockCommand();
	}

	// Disable Lock Mode UI live (remove status bar)
	disableLockMode(): void {
		if (this.lockStatusBar) {
			this.lockStatusBar.dispose();
			this.lockStatusBar = undefined;
		}
		this.unregisterLockCommand();
	}

	// Register command to toggle lock state for active file
	private registerLockCommand(): void {
		if (this.lockCommandRegistered) return;
		try {
			this.addCommand({
				id: this.lockCommandId,
				name: "Lock/unlock",
				callback: async () => {
					const filePath = this.app.workspace.getActiveFile()?.path;
					if (!filePath) return;
					await this.lockManager?.toggleLockState(filePath);
				},
			});
			this.lockCommandRegistered = true;
		} catch (e) {
			console.warn("[AES] addCommand failed:", e);
		}
	}

	// Unregister the lock toggle command if present
	private unregisterLockCommand(): void {
		if (!this.lockCommandRegistered) return;
		try {
			this.removeCommand(this.lockCommandId);
		} catch (e) {
			console.warn("[AES] removeCommand failed:", e);
		} finally {
			this.lockCommandRegistered = false;
		}
	}

	async loadSettings() {
		let settings: PluginSettings = Object.assign(
			{},
			this.DEFAULT_SETTINGS,
			await this.loadData()
		);
		// Apply default for lockModeEnabled (enabled by default)
		if (typeof settings.lockModeEnabled !== "boolean") {
			settings.lockModeEnabled = true;
		}
		this.settings = settings;
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async delay(ms: number) {
		return sleep(ms);
	}

	// Verify scroll position and retry if needed
	private async verifyAndRetryScroll(
		view: MarkdownView,
		targetScroll: number,
		attempt: number
	) {
		const maxAttempts = 4; // 4 attempts as requested
		const retryDelay = 30; // Shorter delay
		const tolerance = 0.02; // 2% tolerance as requested

		// Wait a bit for the scroll to be applied
		await this.delay(30);

		const currentScroll = view.currentMode?.getScroll();
		if (currentScroll !== undefined) {
			const scrollDifference = Math.abs(currentScroll - targetScroll);
			const allowedDifference = Math.max(targetScroll * tolerance, 2); // At least 2px tolerance

			console.debug(
				"[AES] Scroll verification - Target:",
				targetScroll,
				"Current:",
				currentScroll,
				"Difference:",
				scrollDifference,
				"Allowed:",
				allowedDifference
			);

			if (scrollDifference <= allowedDifference) {
				console.debug("[AES] Scroll position verified successfully");
				return;
			}

			if (attempt < maxAttempts - 1) {
				console.debug(
					`[AES] Scroll position mismatch, retrying (attempt ${attempt + 1}/${maxAttempts})`
				);
				// Use requestAnimationFrame to avoid forced reflows
				requestAnimationFrame(() => {
					if (view.currentMode?.applyScroll) {
						view.currentMode.applyScroll(targetScroll);
					}
				});

				// Wait and retry
				await this.delay(retryDelay);
				await this.verifyAndRetryScroll(
					view,
					targetScroll,
					attempt + 1
				);
			} else {
				console.debug(
					"[AES] Scroll position close enough, accepting current position"
				);
				// Don't show notification for minor differences
			}
		} else {
			console.debug(
				"[AES] Could not get current scroll position for verification"
			);
		}
	}
}

class SettingTab extends PluginSettingTab {
	plugin: AntiEphemeralState;

	constructor(app: App, plugin: AntiEphemeralState) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Database directory")
			.setDesc(
				"Root directory for per-file state persistence (one database file per note)"
			)
			.addText(text =>
				text
					.setPlaceholder(this.plugin.DEFAULT_SETTINGS.dbDir)
					.setValue(this.plugin.settings.dbDir)
					.onChange(async value => {
						this.plugin.settings.dbDir = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Database validation")
			.setDesc(
				"Iterate over database entries, fix wrong viewState.file, and remove entries for missing notes"
			)
			.addButton(btn => {
				btn.setButtonText("Run validation")
					.setCta()
					.onClick(async () => {
						new Notice("[AES] Validation started...", 1000);
						await this.plugin.validateDatabase();
					});
			});

		// Toggle to enable/disable Lock Mode
		new Setting(containerEl)
			.setName("Enable lock mode")
			.setDesc(
				"Show lock mode UI and enforce read-only for protected notes"
			)
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.lockModeEnabled !== false)
					.onChange(value => {
						void (async () => {
							this.plugin.settings.lockModeEnabled = value;
							await this.plugin.saveSettings();
							if (value) {
								this.plugin.enableLockMode();
								// Ensure helpers exist
								this.plugin.getChecksumIntegrity();
								if (!this.plugin.lockManager) {
									this.plugin.lockManager = new LockManager(
										this.plugin
									);
								}
							} else {
								this.plugin.disableLockMode();
							}
						})().catch(e =>
							console.warn(
								"[AES] Failed to toggle lock mode setting:",
								e
							)
						);
					})
			);
	}
}

// Minimal Status Bar controller for Lock Mode UI
class LockStatusBar {
	private plugin: AntiEphemeralState;
	private el: HTMLElement;
	private state: "unlocked" | "locked" | "corrupted" = "unlocked";

	constructor(plugin: AntiEphemeralState) {
		this.plugin = plugin;
		this.el = this.plugin.addStatusBarItem();
		this.el.classList.add("aes-lock-status");
		this.el.addEventListener("click", () => this.onClick());
		this.updateIcon(this.state);
	}

	// Update visual icon and tooltip
	updateIcon(state: "unlocked" | "locked" | "corrupted"): void {
		this.state = state;
		// Use simple emoji icons; can be replaced with Obsidian icons later
		let tooltip: string;
		switch (state) {
			case "locked":
				this.el.textContent = "●";
				tooltip = "Locked";
				break;
			case "corrupted":
				this.el.textContent = "✖";
				tooltip = "Modified externally";
				break;
			default:
				this.el.textContent = "○";
				tooltip = "Unlocked";
		}

		// Apply Obsidian tooltip (black) with proper placement; avoid native duplicates
		this.el.removeAttribute("title");
		this.el.removeAttribute("aria-label");
		setTooltip(this.el, tooltip, { placement: "top", gap: 6 });
	}

	private async onClick(): Promise<void> {
		// Delegate to LockManager to toggle protection for the active file
		const filePath = this.plugin.app.workspace.getActiveFile()?.path;
		if (!filePath) return;
		await this.plugin.lockManager?.toggleLockState(filePath);
	}

	// Remove DOM and detach listeners
	dispose(): void {
		if (this.el && this.el.remove) {
			this.el.remove();
		}
	}
}

// Minimal integrity checker using file modification time (mtime)
class ChecksumIntegrity {
	private plugin: AntiEphemeralState;

	constructor(plugin: AntiEphemeralState) {
		this.plugin = plugin;
	}

	// Get file modification timestamp in milliseconds using Obsidian adapter
	async getFileTimestamp(filePath: string): Promise<number> {
		const s = await this.plugin.app.vault.adapter.stat(filePath);
		if (!s || typeof s.mtime !== "number") {
			throw new Error(`[AES] stat() returned no mtime for ${filePath}`);
		}
		return s.mtime;
	}

	// Compare current mtime with expected timestamp
	async verifyFileIntegrity(
		filePath: string,
		expectedTimestamp: number
	): Promise<boolean> {
		const current = await this.getFileTimestamp(filePath);
		// Debug: log both timestamps for troubleshooting mtime caching/mismatch
		console.debug("[AES] Integrity mtime match check:", {
			filePath,
			apiTimestamp: current,
			stateTimestamp: expectedTimestamp,
		});
		return current === expectedTimestamp;
	}
}

// Lock manager controlling protected state and status bar integration
class LockManager {
	private plugin: AntiEphemeralState;

	constructor(plugin: AntiEphemeralState) {
		this.plugin = plugin;
	}

	// Toggle protection for the given file
	async toggleLockState(filePath: string): Promise<void> {
		// Read current state
		const current = (await this.plugin.readFileState(filePath)) || {};
		const nextProtected = !current.protected;

		// Update UI icon early for responsiveness
		const sb = this.plugin.getLockStatusBar();
		if (sb) {
			sb.updateIcon(nextProtected ? "locked" : "unlocked");
		}

		// Persist new state with timestamp if locking
		let timestamp: number | null = null;
		if (nextProtected) {
			try {
				const integrity = this.plugin.getChecksumIntegrity();
				timestamp = await integrity.getFileTimestamp(filePath);
			} catch (e) {
				console.error("[AES] Failed to acquire timestamp for lock:", e);
				timestamp = null;
			}
		}

		const newState: TemporaryState = {
			...current,
			protected: nextProtected,
			timestamp,
		};

		await this.plugin.writeFileState(filePath, newState);
		// Keep plugin memory in sync to prevent later auto-saves from overwriting lock fields
		this.plugin.lastTemporaryState = {
			...(this.plugin.lastTemporaryState || {}),
			...newState,
		};

		// If we just enabled protection, immediately enforce preview mode
		if (nextProtected) {
			await this.enforceReadOnlyMode(filePath);
		}
	}

	// Returns true when file is considered locked
	async isFileLocked(filePath: string): Promise<boolean> {
		const current = await this.plugin.readFileState(filePath);
		return !!current?.protected;
	}

	// Ensure MarkdownView is in preview when file is locked. Preserve cursor/scroll via plugin.setTemporaryState
	async enforceReadOnlyMode(filePath: string): Promise<void> {
		// Fast path: only act when current file matches and is locked
		const active =
			this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!active || active.file?.path !== filePath) return;
		const locked = await this.isFileLocked(filePath);
		if (!locked) return;

		// Check current mode; if already preview, do nothing
		const rawState = active.getState();
		const mode =
			typeof rawState.mode === "string" ? rawState.mode : undefined;
		if (mode === "preview") return;

		// Capture cursor/scroll only to avoid restoring mode back to source
		const ephemeral = this.plugin.getTemporaryState();
		const toRestore: TemporaryState = {
			cursor: ephemeral.cursor,
			scroll: ephemeral.scroll,
		};

		// Switch to preview using official API
		await active.setState(
			{
				...active.getState(),
				mode: "preview",
			},
			{ history: false }
		);

		// Re-apply only cursor/scroll to avoid UX jumps
		this.plugin.setTemporaryState(toRestore);

		// Inform user about automatic enforcement of Lock Mode
		new Notice("Lock mode enabled", 1000);
	}
}

// Public helpers to access private components safely
// They are methods of AntiEphemeralState class; patching by appending below class definitions is not valid.
