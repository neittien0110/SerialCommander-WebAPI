
module.exports = {
    testEnvironment: "node",
    globalSetup: '<rootDir>/tests/jest.globalSetup.js',
    globalTeardown: '<rootDir>/tests/jest.globalTeardown.js',
    moduleDirectories: ["node_modules", "<rootDir>"],
    modulePaths: ["<rootDir>"],
    roots: ["<rootDir>"],
    rootDir: ".",
    testMatch:["<rootDir>/modules/**/*.test.js"],
};
