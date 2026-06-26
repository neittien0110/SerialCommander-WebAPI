const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.resetModules();
});

function freshWithMocks({ envFileEnv, nodeEnv, secretsExists = false } = {}) {
  jest.resetModules();

  const dotenvConfig = jest.fn();
  jest.doMock("dotenv", () => ({ config: dotenvConfig }));
  jest.doMock("fs", () => ({ existsSync: jest.fn().mockReturnValue(secretsExists) }));

  if (envFileEnv !== undefined) process.env.ENV_FILE = envFileEnv;
  else delete process.env.ENV_FILE;

  if (nodeEnv !== undefined) process.env.NODE_ENV = nodeEnv;

  const mod = require("../configs/bootstrapEnv");
  return { mod, dotenvConfig };
}

describe("bootstrapEnv — resolveEnvFilePath", () => {
  test("dùng ENV_FILE khi được đặt", () => {
    const { mod } = freshWithMocks({ envFileEnv: "/custom/.env" });
    expect(mod.resolveEnvFilePath()).toBe("/custom/.env");
  });

  test("dùng .env khi NODE_ENV=production", () => {
    const { mod } = freshWithMocks({ nodeEnv: "production" });
    expect(mod.resolveEnvFilePath()).toMatch(/\.env$/);
    expect(mod.resolveEnvFilePath()).not.toContain(".env.local");
  });

  test("dùng .env.local trong môi trường dev", () => {
    const { mod } = freshWithMocks({ nodeEnv: "development" });
    expect(mod.resolveEnvFilePath()).toContain(".env.local");
  });
});

describe("bootstrapEnv — loadEnvFiles", () => {
  test("ENV_FILE path: gọi dotenv.config 1 lần, trả {layered: false}", () => {
    const { mod, dotenvConfig } = freshWithMocks({ envFileEnv: "/custom/.env" });
    // loadEnvFiles() đã chạy tự động khi require; gọi lại để kiểm tra behavior
    dotenvConfig.mockClear();
    const result = mod.loadEnvFiles();
    expect(dotenvConfig).toHaveBeenCalledTimes(1);
    expect(result.layered).toBe(false);
    expect(result.envFile).toBe("/custom/.env");
  });

  test("production path: gọi dotenv.config 1 lần với .env", () => {
    const { mod, dotenvConfig } = freshWithMocks({ nodeEnv: "production" });
    dotenvConfig.mockClear();
    const result = mod.loadEnvFiles();
    expect(dotenvConfig).toHaveBeenCalledTimes(1);
    expect(result.layered).toBe(false);
    expect(result.envFile).toMatch(/\.env$/);
  });

  test("development path: gọi dotenv.config 2 lần (base + local), không secrets", () => {
    const { mod, dotenvConfig } = freshWithMocks({ nodeEnv: "development", secretsExists: false });
    dotenvConfig.mockClear();
    const result = mod.loadEnvFiles();
    expect(dotenvConfig).toHaveBeenCalledTimes(2);
    expect(result.layered).toBe(true);
  });

  test("development path: gọi dotenv.config 3 lần khi secretsEnv tồn tại", () => {
    const { mod, dotenvConfig } = freshWithMocks({ nodeEnv: "development", secretsExists: true });
    dotenvConfig.mockClear();
    const result = mod.loadEnvFiles();
    expect(dotenvConfig).toHaveBeenCalledTimes(3);
    expect(result.layered).toBe(true);
  });

  test("bảo toàn NODE_ENV=test sau khi load layered", () => {
    const { mod } = freshWithMocks({ nodeEnv: "test", secretsExists: false });
    // After loadEnvFiles(), NODE_ENV should still be "test"
    expect(process.env.NODE_ENV).toBe("test");
  });
});
