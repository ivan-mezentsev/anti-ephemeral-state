import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginPrettier from "eslint-plugin-prettier";

export default [
	js.configs.recommended,
	{
		files: ["**/*.ts", "**/*.js"],
		languageOptions: {
			parser: tsparser,
			ecmaVersion: 2020,
			sourceType: "module",
			globals: {
				node: true,
				console: "readonly",
				document: "readonly",
				window: "readonly",
				HTMLElement: "readonly",
				HTMLInputElement: "readonly",
				KeyboardEvent: "readonly",
				Event: "readonly",
				Element: "readonly",
				Node: "readonly",
				CustomEvent: "readonly",
				setTimeout: "readonly",
				clearInterval: "readonly",
				RequestInfo: "readonly",
				URL: "readonly",
				RequestInit: "readonly",
				Response: "readonly",
				fetch: "readonly",
				TextDecoder: "readonly",
				setInterval: "readonly",
				HTMLSpanElement: "readonly",
				NodeJS: "readonly",
				clearTimeout: "readonly",
				ResponseInit: "readonly",
				requestAnimationFrame: "readonly",
			},
		},
		plugins: {
			"@typescript-eslint": tseslint,
			prettier: eslintPluginPrettier,
		},
		rules: {
			...tseslint.configs.recommended.rules,
			...tseslint.configs["eslint-recommended"].rules,
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
				},
			],
			"@typescript-eslint/ban-ts-comment": "error",
			"no-prototype-builtins": "error",
			"@typescript-eslint/no-empty-function": "off",
			"prettier/prettier": "error",
		},
	},
	// Prettier integration - must be last to override conflicting rules
	eslintConfigPrettier,
	// Jest test files configuration
	{
		files: [
			"**/*.test.ts",
			"**/*.test.js",
			"__mocks__/**/*.ts",
			"__mocks__/**/*.js",
		],
		languageOptions: {
			globals: {
				jest: "readonly",
				describe: "readonly",
				test: "readonly",
				it: "readonly",
				expect: "readonly",
				beforeEach: "readonly",
				afterEach: "readonly",
				beforeAll: "readonly",
				afterAll: "readonly",
				navigator: "readonly",
			},
		},
	},
	// Node.js files configuration
	{
		files: ["**/*.js", "__mocks__/**/*.js"],
		languageOptions: {
			globals: {
				module: "readonly",
				require: "readonly",
				exports: "readonly",
				__dirname: "readonly",
				__filename: "readonly",
				global: "readonly",
				process: "readonly",
				Buffer: "readonly",
				navigator: "readonly",
			},
		},
		rules: {
			"@typescript-eslint/no-require-imports": "off",
		},
	},
	// Mock files configuration - relaxed rules for test mocks
	{
		files: ["__mocks__/**/*.ts", "__mocks__/**/*.js"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/ban-ts-comment": "off",
			"@typescript-eslint/no-empty-function": "off",
			"no-unused-vars": "off",
		},
	},
	{
		ignores: [
			"node_modules/",
			"main.js",
			"references/",
			"version-bump.mjs",
			"**/jest.*",
		],
	},
];
