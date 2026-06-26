const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.resetModules();
});

function fresh() {
  jest.resetModules();
  return require("../configs/databaseEnv");
}

describe("databaseEnv — assertDatabaseEnvLoaded", () => {
  describe("DATABASE_ENV=development (mặc định)", () => {
    test("throw khi thiếu DATABASE_HOST", () => {
      delete process.env.DATABASE_HOST;
      delete process.env.DATABASE_ENV;
      const { assertDatabaseEnvLoaded } = fresh();
      expect(() => assertDatabaseEnvLoaded()).toThrow("DATABASE_HOST");
    });

    test("throw khi DATABASE_HOST rỗng/khoảng trắng", () => {
      process.env.DATABASE_HOST = "   ";
      process.env.DATABASE_NAME = "mydb";
      process.env.DATABASE_USERNAME = "root";
      process.env.DATABASE_PASSWORD = "pass";
      delete process.env.DATABASE_ENV;
      const { assertDatabaseEnvLoaded } = fresh();
      expect(() => assertDatabaseEnvLoaded()).toThrow();
    });

    test("không throw khi đủ 4 keys development", () => {
      process.env.DATABASE_HOST = "localhost";
      process.env.DATABASE_NAME = "mydb";
      process.env.DATABASE_USERNAME = "root";
      process.env.DATABASE_PASSWORD = "pass";
      process.env.DATABASE_ENV = "development";
      const { assertDatabaseEnvLoaded } = fresh();
      expect(() => assertDatabaseEnvLoaded()).not.toThrow();
    });
  });

  describe("DATABASE_ENV=test", () => {
    test("throw khi thiếu DATABASE_TEST_NAME", () => {
      process.env.DATABASE_ENV = "test";
      delete process.env.DATABASE_TEST_NAME;
      process.env.DATABASE_TEST_USERNAME = "root";
      process.env.DATABASE_TEST_PASSWORD = "pass";
      const { assertDatabaseEnvLoaded } = fresh();
      expect(() => assertDatabaseEnvLoaded()).toThrow("DATABASE_TEST_NAME");
    });

    test("không throw khi đủ 3 keys test", () => {
      process.env.DATABASE_ENV = "test";
      process.env.DATABASE_TEST_NAME = "testdb";
      process.env.DATABASE_TEST_USERNAME = "root";
      process.env.DATABASE_TEST_PASSWORD = "pass";
      const { assertDatabaseEnvLoaded } = fresh();
      expect(() => assertDatabaseEnvLoaded()).not.toThrow();
    });
  });

  describe("DATABASE_ENV=production", () => {
    test("throw khi thiếu production DB keys", () => {
      process.env.DATABASE_ENV = "production";
      delete process.env.DATABASE_HOST;
      delete process.env.PROD_DB_HOSTNAME;
      delete process.env.DATABASE_NAME;
      delete process.env.PROD_DB_NAME;
      delete process.env.DATABASE_USERNAME;
      delete process.env.PROD_DB_USERNAME;
      delete process.env.DATABASE_PASSWORD;
      delete process.env.PROD_DB_PASSWORD;
      const { assertDatabaseEnvLoaded } = fresh();
      expect(() => assertDatabaseEnvLoaded()).toThrow("[db] Thiếu cấu hình DB production");
    });

    test("không throw khi dùng DATABASE_* production keys", () => {
      process.env.DATABASE_ENV = "production";
      process.env.DATABASE_HOST = "prod-host";
      process.env.DATABASE_NAME = "prod-db";
      process.env.DATABASE_USERNAME = "prod-user";
      process.env.DATABASE_PASSWORD = "prod-pass";
      const { assertDatabaseEnvLoaded } = fresh();
      expect(() => assertDatabaseEnvLoaded()).not.toThrow();
    });

    test("không throw khi dùng PROD_DB_* production keys", () => {
      process.env.DATABASE_ENV = "production";
      delete process.env.DATABASE_HOST;
      delete process.env.DATABASE_NAME;
      delete process.env.DATABASE_USERNAME;
      delete process.env.DATABASE_PASSWORD;
      process.env.PROD_DB_HOSTNAME = "prod-host";
      process.env.PROD_DB_NAME = "prod-db";
      process.env.PROD_DB_USERNAME = "prod-user";
      process.env.PROD_DB_PASSWORD = "prod-pass";
      const { assertDatabaseEnvLoaded } = fresh();
      expect(() => assertDatabaseEnvLoaded()).not.toThrow();
    });
  });
});
