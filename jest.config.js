/**
 * `npm test` — unit tests không cần DB (auth, middleware).
 * Threshold: global nhẹ + các path lõi có thêm chỉ tiêu.
 */
module.exports = {
  testEnvironment: "node",
  moduleDirectories: ["node_modules", "<rootDir>"],
  modulePaths: ["<rootDir>"],
  roots: ["<rootDir>"],
  rootDir: ".",
  testMatch: ["<rootDir>/tests/**/*.test.js", "<rootDir>/modules/**/*.test.js"],
  collectCoverageFrom: [
    "modules/**/*.js",
    "routes/**/*.js",
    "kernels/**/*.js",
    "configs/**/*.js",
    "!**/*.test.js",
    "!kernels/tests/**",
  ],
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 50,
      lines: 52,
      statements: 52,
    },
    "modules/auth/**/*.js": {
      branches: 50,
      functions: 65,
      lines: 60,
      statements: 60,
    },
    "modules/auth/services/**/*.js": {
      branches: 60,
      functions: 70,
      lines: 65,
      statements: 65,
    },
    "modules/config/services/**/*.js": {
      branches: 55,
      functions: 70,
      lines: 70,
      statements: 70,
    },
    "kernels/scenarioDlqReconcile.js": {
      branches: 60,
      functions: 80,
      lines: 78,
      statements: 78,
    },
    "kernels/middlewares/authMiddleware.js": {
      branches: 84,
      functions: 100,
      lines: 90,
      statements: 90,
    },
    "kernels/middlewares/requestTraceMiddleware.js": {
      branches: 75,
      functions: 100,
      lines: 85,
      statements: 85,
    },
    "kernels/remoteSession/remoteSessionStore.js": {
      branches: 55,
      functions: 80,
      lines: 75,
      statements: 75,
    },
  },
  testTimeout: 15000,
  coverageProvider: "v8",
  coverageReporters: ["text", "html", "lcov"],
  coverageDirectory: "coverage",
};
