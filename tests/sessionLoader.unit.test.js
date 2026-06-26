const logWarnFn = jest.fn();
const logErrorFn = jest.fn();

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  delete process.env.SESSION_REDIS_URL;
  delete process.env.RATE_LIMIT_REDIS_URL;
  process.env.NODE_ENV = "test";
});

function loadModule(mockedRedisError) {
  jest.resetModules();

  const mockRedisInstance = {};
  const RedisMock = jest.fn().mockReturnValue(mockRedisInstance);
  const mockStore = { type: "redis-store" };

  let RedisStoreMock;
  if (mockedRedisError) {
    RedisStoreMock = { RedisStore: jest.fn().mockImplementation(() => { throw mockedRedisError; }) };
  } else {
    RedisStoreMock = { RedisStore: jest.fn().mockReturnValue(mockStore) };
  }

  jest.doMock("ioredis", () => RedisMock);
  jest.doMock("connect-redis", () => RedisStoreMock);
  jest.doMock("../kernels/logging/appLogger", () => ({ logWarn: logWarnFn, logError: logErrorFn }));
  jest.doMock("express-session", () => jest.fn().mockReturnValue("session-middleware"));

  return {
    mod: require("../kernels/loaders/sessionLoader"),
    RedisMock,
    RedisStoreMock,
    mockStore,
  };
}

// ── NODE_ENV=test: returns undefined early ────────────────────────────────────

describe("buildSessionStore — test env", () => {
  test("NODE_ENV=test → store = undefined, không dùng Redis", () => {
    process.env.NODE_ENV = "test";
    const { mod, RedisStoreMock } = loadModule();
    const mockApp = { use: jest.fn() };
    mod.configureSession(mockApp, "secret");
    expect(RedisStoreMock.RedisStore).not.toHaveBeenCalled();
    expect(mockApp.use).toHaveBeenCalledTimes(1);
  });
});

// ── Development: no Redis URL ──────────────────────────────────────────────────

describe("buildSessionStore — dev, no redis URL", () => {
  test("không có sessionRedisUrl → không tạo store, không warn", () => {
    process.env.NODE_ENV = "development";
    const { mod, RedisStoreMock } = loadModule();
    const mockApp = { use: jest.fn() };
    mod.configureSession(mockApp, "secret");
    expect(RedisStoreMock.RedisStore).not.toHaveBeenCalled();
    expect(logWarnFn).not.toHaveBeenCalled();
  });
});

// ── Development: SESSION_REDIS_URL present ─────────────────────────────────────

describe("buildSessionStore — dev, SESSION_REDIS_URL set", () => {
  test("tạo RedisStore từ SESSION_REDIS_URL", () => {
    process.env.NODE_ENV = "development";
    process.env.SESSION_REDIS_URL = "redis://localhost:6379";
    const { mod, RedisMock, RedisStoreMock } = loadModule();
    const mockApp = { use: jest.fn() };
    mod.configureSession(mockApp, "secret");
    expect(RedisMock).toHaveBeenCalledWith("redis://localhost:6379", expect.any(Object));
    expect(RedisStoreMock.RedisStore).toHaveBeenCalled();
  });

  test("fallback RATE_LIMIT_REDIS_URL khi không có SESSION_REDIS_URL", () => {
    process.env.NODE_ENV = "development";
    process.env.RATE_LIMIT_REDIS_URL = "redis://localhost:6379";
    const { mod, RedisMock, RedisStoreMock } = loadModule();
    const mockApp = { use: jest.fn() };
    mod.configureSession(mockApp, "secret");
    expect(RedisMock).toHaveBeenCalled();
    expect(RedisStoreMock.RedisStore).toHaveBeenCalled();
  });

  test("connect-redis throw trong dev → logWarn + vẫn gọi app.use", () => {
    process.env.NODE_ENV = "development";
    process.env.SESSION_REDIS_URL = "redis://localhost:6379";
    const { mod } = loadModule(new Error("redis unavailable"));
    const mockApp = { use: jest.fn() };
    mod.configureSession(mockApp, "secret");
    expect(logWarnFn).toHaveBeenCalledWith(
      expect.stringContaining("[session] Cannot initialize Redis session store:"),
      expect.objectContaining({ error: "redis unavailable" })
    );
    expect(mockApp.use).toHaveBeenCalledTimes(1);
  });
});

// ── configureSession wires express-session ─────────────────────────────────────

describe("configureSession", () => {
  test("gọi app.use với session middleware", () => {
    process.env.NODE_ENV = "test";
    const { mod } = loadModule();
    const mockApp = { use: jest.fn() };
    mod.configureSession(mockApp, "my-secret");
    expect(mockApp.use).toHaveBeenCalledTimes(1);
  });
});
