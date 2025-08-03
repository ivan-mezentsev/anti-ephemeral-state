module.exports = {
	preset: "ts-jest",
	testEnvironment: "jsdom",
	moduleNameMapper: {
		"\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$":
			"<rootDir>/tests/__mocks__/fileMock.js",
		"^obsidian$": "<rootDir>/tests/__mocks__/obsidian.ts",
	},
	setupFiles: ["<rootDir>/jest.setup.js"],
	testPathIgnorePatterns: ["/node_modules/", "/dist/", "/references/"],
	modulePathIgnorePatterns: ["/references/"],
	transform: {
		"^.+\\.(ts|tsx|js|jsx)$": "ts-jest",
	},
	transformIgnorePatterns: ["node_modules/(?!(@google/genai)/)"],
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
	testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.[jt]sx?$",
	setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
};
