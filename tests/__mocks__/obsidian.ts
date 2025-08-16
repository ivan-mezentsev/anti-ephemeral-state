// Extended Mock for Obsidian API based on references/obsidian-ai-actions
// with additional support for configDir and comprehensive testing utilities

export interface MockApp {
	vault: MockVault;
	workspace: MockWorkspace;
}

export interface MockManifest {
	id: string;
	name: string;
	version: string;
	author: string;
	minAppVersion: string;
}

export class MockVaultAdapter {
	private files: Map<string, string> = new Map();
	private directories: Set<string> = new Set();

	async read(path: string): Promise<string> {
		if (!this.files.has(path)) {
			throw new Error(
				`ENOENT: no such file or directory, open '${path}'`
			);
		}
		return this.files.get(path) || "";
	}

	async write(path: string, data: string): Promise<void> {
		// Ensure directory exists
		const dir = path.substring(0, path.lastIndexOf("/"));
		if (dir && !this.directories.has(dir)) {
			await this.mkdir(dir);
		}
		this.files.set(path, data);
	}

	async exists(path: string): Promise<boolean> {
		return this.files.has(path) || this.directories.has(path);
	}

	async mkdir(path: string): Promise<void> {
		this.directories.add(path);
		// Also add parent directories
		const parts = path.split("/");
		for (let i = 1; i < parts.length; i++) {
			const parentPath = parts.slice(0, i + 1).join("/");
			this.directories.add(parentPath);
		}
	}

	async remove(path: string): Promise<void> {
		this.files.delete(path);
		this.directories.delete(path);
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		if (this.files.has(oldPath)) {
			const data = this.files.get(oldPath);
			this.files.delete(oldPath);
			if (data !== undefined) {
				this.files.set(newPath, data);
			}
		}
	}

	async list(path: string): Promise<{ files: string[]; folders: string[] }> {
		const files: string[] = [];
		const folders: string[] = [];

		// Get all files and directories under the specified path
		for (const filePath of this.files.keys()) {
			if (
				filePath.startsWith(path + "/") ||
				(path === "" && !filePath.includes("/"))
			) {
				const relativePath =
					path === "" ? filePath : filePath.slice(path.length + 1);
				if (!relativePath.includes("/")) {
					files.push(filePath);
				}
			} else if (path !== "" && filePath === path) {
				// The path itself is a file
				files.push(filePath);
			}
		}

		for (const dirPath of this.directories) {
			if (
				dirPath.startsWith(path + "/") ||
				(path === "" && !dirPath.includes("/"))
			) {
				const relativePath =
					path === "" ? dirPath : dirPath.slice(path.length + 1);
				if (!relativePath.includes("/")) {
					folders.push(dirPath);
				}
			} else if (path !== "" && dirPath === path) {
				// The path itself is a directory
				folders.push(dirPath);
			}
		}

		return { files, folders };
	}

	// Test utilities
	setFileContent(path: string, content: string): void {
		this.files.set(path, content);
	}

	reset(): void {
		this.files.clear();
		this.directories.clear();
	}

	getAllFiles(): string[] {
		return Array.from(this.files.keys());
	}
}

export class MockVault {
	adapter: MockVaultAdapter;
	configDir: string;
	private listeners: Map<string, ((...args: unknown[]) => void)[]> =
		new Map();

	constructor(configDir = "/test/.obsidian") {
		this.configDir = configDir;
		this.adapter = new MockVaultAdapter();
	}

	async read(file: TFile): Promise<string> {
		return this.adapter.read(file.path);
	}

	async create(path: string, data: string): Promise<TFile> {
		await this.adapter.write(path, data);
		return new TFile(path);
	}

	async modify(file: TFile, data: string): Promise<void> {
		await this.adapter.write(file.path, data);
	}

	async delete(file: TFile): Promise<void> {
		await this.adapter.remove(file.path);
	}

	async rename(file: TFile, newPath: string): Promise<void> {
		await this.adapter.rename(file.path, newPath);
		file.path = newPath;
	}

	getAbstractFileByPath(path: string): TAbstractFile | null {
		return this.adapter.getAllFiles().includes(path)
			? new TFile(path)
			: null;
	}

	// Event system
	on(event: string, callback: (...args: unknown[]) => void): void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, []);
		}
		this.listeners.get(event)?.push(callback);
	}

	off(event: string, callback: (...args: unknown[]) => void): void {
		const callbacks = this.listeners.get(event);
		if (callbacks) {
			const index = callbacks.indexOf(callback);
			if (index > -1) {
				callbacks.splice(index, 1);
			}
		}
	}

	trigger(event: string, ...args: unknown[]): void {
		const callbacks = this.listeners.get(event);
		if (callbacks) {
			callbacks.forEach(callback => callback(...args));
		}
	}

	// Test utilities
	setConfigDir(configDir: string): void {
		this.configDir = configDir;
	}
}

export class MockWorkspaceSplit {
	children: MockWorkspaceSplit[] = [];
	type: string = "split";

	constructor() {}
}

export class MockWorkspace {
	leftSplit?: MockWorkspaceSplit;
	rightSplit?: MockWorkspaceSplit;
	containerEl: HTMLElement;
	private listeners: Map<string, ((...args: unknown[]) => void)[]> =
		new Map();
	private activeFile: TFile | null = null;

	constructor() {
		this.leftSplit = new MockWorkspaceSplit();
		this.rightSplit = new MockWorkspaceSplit();

		// Create mock container element
		if (typeof document !== "undefined") {
			this.containerEl = document.createElement("div");
			this.containerEl.className = "workspace";
		} else {
			// Fallback for environments without DOM - create minimal mock
			const mockElement = {
				className: "workspace",
				querySelector: () => null,
				addEventListener: () => {},
				removeEventListener: () => {},
				dispatchEvent: () => true,
			};
			this.containerEl = mockElement as unknown as HTMLElement;
		}
	}

	// Layout ready system
	onLayoutReady(callback: () => void): void {
		// Simulate layout being ready immediately in tests
		setTimeout(() => callback(), 0);
	}

	// Active file management
	getActiveFile(): TFile | null {
		return this.activeFile;
	}

	setActiveFile(file: TFile): void {
		this.activeFile = file;
	}

	// Event system
	on(event: string, callback: (...args: unknown[]) => void): void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, []);
		}
		this.listeners.get(event)?.push(callback);
	}

	off(event: string, callback: (...args: unknown[]) => void): void {
		const callbacks = this.listeners.get(event);
		if (callbacks) {
			const index = callbacks.indexOf(callback);
			if (index > -1) {
				callbacks.splice(index, 1);
			}
		}
	}

	trigger(event: string, ...args: unknown[]): void {
		const callbacks = this.listeners.get(event);
		if (callbacks) {
			callbacks.forEach(callback => callback(...args));
		}
	}

	// Mock method for getting active view of specific type
	getActiveViewOfType<T>(type: new (...args: unknown[]) => T): T | null {
		// Mock implementation - returns null by default
		// Tests can override this behavior
		return null;
	}

	async revealLeaf(leaf: unknown): Promise<void> {
		// Mock implementation
		return Promise.resolve();
	}
}

export class Plugin {
	app: MockApp;
	manifest: MockManifest;
	private settings: Record<string, unknown> = {};

	constructor(app: MockApp, manifest: MockManifest) {
		this.app = app;
		this.manifest = manifest;
	}

	onload(): void {}
	onunload(): void {}

	addCommand(): void {}
	addSettingTab(): void {}
	addStatusBarItem(): HTMLElement {
		// Create a simple DOM element to simulate Obsidian status bar item
		const el = document.createElement("div");
		el.className = "status-bar-item";
		return el;
	}
	registerEvent(eventRef: unknown): void {
		// Mock implementation - just store the reference
	}
	registerDomEvent(
		element: HTMLElement | typeof document,
		event: string,
		handler: (event: Event) => void,
		options?: { passive?: boolean; capture?: boolean }
	): void {
		// Mock implementation - actually add the event listener for testing
		element.addEventListener(event, handler, options);
	}

	async loadData(): Promise<Record<string, unknown>> {
		return Promise.resolve(this.settings);
	}

	async saveData(data: Record<string, unknown>): Promise<void> {
		this.settings = { ...data };
		return Promise.resolve();
	}

	// Test utilities
	setMockData(data: Record<string, unknown>): void {
		this.settings = { ...data };
	}

	getMockData(): Record<string, unknown> {
		return { ...this.settings };
	}
}

export class Setting {
	constructor(public containerEl: HTMLElement) {}

	setName(name: string): Setting {
		return this;
	}

	setDesc(desc: string): Setting {
		return this;
	}

	addText(callback?: (text: TextComponent) => void): Setting {
		if (callback) {
			callback(new TextComponent());
		}
		return this;
	}

	addButton(callback?: (button: ButtonComponent) => void): Setting {
		if (callback) {
			callback(new ButtonComponent());
		}
		return this;
	}

	addToggle(callback?: (toggle: ToggleComponent) => void): Setting {
		if (callback) {
			callback(new ToggleComponent());
		}
		return this;
	}

	addDropdown(callback?: (dropdown: DropdownComponent) => void): Setting {
		if (callback) {
			callback(new DropdownComponent());
		}
		return this;
	}
}

export class TextComponent {
	private value = "";
	private placeholder = "";

	setValue(value: string): TextComponent {
		this.value = value;
		return this;
	}

	getValue(): string {
		return this.value;
	}

	setPlaceholder(placeholder: string): TextComponent {
		this.placeholder = placeholder;
		return this;
	}

	onChange(callback: (value: string) => void): TextComponent {
		return this;
	}
}

export class ButtonComponent {
	private text = "";

	setButtonText(text: string): ButtonComponent {
		this.text = text;
		return this;
	}

	onClick(callback: () => void): ButtonComponent {
		return this;
	}
}

export class ToggleComponent {
	private value = false;

	setValue(value: boolean): ToggleComponent {
		this.value = value;
		return this;
	}

	getValue(): boolean {
		return this.value;
	}

	onChange(callback: (value: boolean) => void): ToggleComponent {
		return this;
	}
}

export class DropdownComponent {
	private value = "";
	private options: Record<string, string> = {};

	addOption(value: string, display: string): DropdownComponent {
		this.options[value] = display;
		return this;
	}

	setValue(value: string): DropdownComponent {
		this.value = value;
		return this;
	}

	getValue(): string {
		return this.value;
	}

	onChange(callback: (value: string) => void): DropdownComponent {
		return this;
	}
}

export class PluginSettingTab {
	constructor(
		public app: MockApp,
		public plugin: Plugin
	) {}

	display(): void {}
}

export class Modal {
	constructor(public app: MockApp) {}

	open(): void {}
	close(): void {}
	onOpen(): void {}
	onClose(): void {}
}

export class Notice {
	constructor(message: string, timeout?: number) {}
}

export const Platform = {
	isMobile: false,
	isDesktop: true,
	isWin: false,
	isMacOS: true,
	isLinux: false,
};

export class Component {
	load(): void {}
	unload(): void {}
	addChild(): void {}
	removeChild(): void {}
}

export class TFile {
	name: string;
	basename: string;
	extension: string;
	parent: TFolder | null = null;
	vault: MockVault | null = null;

	constructor(public path: string) {
		const parts = path.split("/");
		this.name = parts[parts.length - 1];
		const dotIndex = this.name.lastIndexOf(".");
		if (dotIndex > 0) {
			this.basename = this.name.substring(0, dotIndex);
			this.extension = this.name.substring(dotIndex + 1);
		} else {
			this.basename = this.name;
			this.extension = "";
		}
	}
}

export class TFolder {
	children: TAbstractFile[] = [];

	constructor(
		public vault: MockVault,
		public path: string,
		public name: string,
		public parent: TFolder | null = null
	) {}
}

export type TAbstractFile = TFile | TFolder;

export class Vault {
	configDir: string;
	adapter: MockVaultAdapter;

	constructor(configDir = "/test/.obsidian") {
		this.configDir = configDir;
		this.adapter = new MockVaultAdapter();
	}

	async read(file: TFile): Promise<string> {
		return this.adapter.read(file.path);
	}

	async create(path: string, data: string): Promise<TFile> {
		await this.adapter.write(path, data);
		return new TFile(path);
	}

	async modify(file: TFile, data: string): Promise<void> {
		await this.adapter.write(file.path, data);
	}

	async delete(file: TFile): Promise<void> {
		await this.adapter.remove(file.path);
	}
}

export class App {
	vault: MockVault;
	workspace: MockWorkspace;

	constructor(configDir = "/test/.obsidian") {
		this.vault = new MockVault(configDir);
		this.workspace = new MockWorkspace();
	}

	// Test utilities
	setConfigDir(configDir: string): void {
		this.vault.setConfigDir(configDir);
	}
}

// Mock view state interfaces
export interface ViewState {
	type: string;
	state?: Record<string, unknown>;
	file?: string;
	active?: boolean;
	group?: number;
}

export interface EditorPosition {
	line: number;
	ch: number;
}

export interface EditorRange {
	from: EditorPosition;
	to: EditorPosition;
}

export class MarkdownView {
	file: TFile | null = null;
	editor: Editor;
	currentMode: {
		getScroll: () => number;
		applyScroll: (pos: number) => void;
	} | null = null;
	leaf: unknown = null;

	constructor(file?: TFile) {
		this.file = file || null;
		this.editor = new Editor();
		this.currentMode = {
			getScroll: () => 0,
			applyScroll: () => {},
		};
	}

	getState(): ViewState {
		return {
			type: "markdown",
			state: {},
			file: this.file?.path,
		};
	}

	setState(state: ViewState): void {
		// Mock implementation
	}

	getViewData(): string {
		return "";
	}

	setViewData(data: string): void {
		// Mock implementation
	}

	getViewType(): string {
		return "markdown";
	}

	setEphemeralState(state: unknown): void {
		// Mock implementation
	}
}

export class Editor {
	private content = "";
	private cursor = { line: 0, ch: 0 };

	getValue(): string {
		return this.content;
	}

	setValue(content: string): void {
		this.content = content;
	}

	getCursor(type?: "anchor" | "head"): EditorPosition {
		// Mock implementation - returns same cursor for both anchor and head
		return { ...this.cursor };
	}

	setCursor(pos: EditorPosition): void {
		this.cursor = { ...pos };
	}

	getSelection(): string {
		return "";
	}

	setSelection(from: EditorPosition, to?: EditorPosition): void {
		// Mock implementation
	}

	getScrollInfo(): { top: number; left: number } {
		return { top: 0, left: 0 };
	}

	scrollTo(x: number, y: number): void {
		// Mock implementation
	}
}

// Debounce function mock
export function debounce<T extends unknown[]>(
	callback: (...args: T) => void,
	delay: number
): (...args: T) => void {
	let timeoutId: NodeJS.Timeout;

	const debouncedFunction = (...args: T): void => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => callback(...args), delay);
	};

	// Add cancel method for testing
	const debouncedWithCancel =
		debouncedFunction as typeof debouncedFunction & { cancel: () => void };
	debouncedWithCancel.cancel = () => {
		clearTimeout(timeoutId);
	};

	return debouncedWithCancel;
}

// Test utilities for creating mock data
export class TestUtils {
	static createMockApp(configDir = "/test/.obsidian"): App {
		return new App(configDir);
	}

	static createMockFile(path: string): TFile {
		return new TFile(path);
	}

	static createMockManifest(
		overrides: Partial<MockManifest> = {}
	): MockManifest {
		return {
			id: "test-plugin",
			name: "Test Plugin",
			version: "1.0.0",
			author: "Test Author",
			minAppVersion: "0.15.0",
			...overrides,
		};
	}

	static createMockPlugin(app?: MockApp, manifest?: MockManifest): Plugin {
		const mockApp = app || TestUtils.createMockApp();
		const mockManifest = manifest || TestUtils.createMockManifest();
		return new Plugin(mockApp, mockManifest);
	}

	static async setupMockFileSystem(
		vault: MockVault,
		files: Record<string, string>
	): Promise<void> {
		for (const [path, content] of Object.entries(files)) {
			await vault.adapter.write(path, content);
		}
	}

	static createMockViewState(overrides: Partial<ViewState> = {}): ViewState {
		return {
			type: "markdown",
			state: {},
			file: "test.md",
			...overrides,
		};
	}
}
