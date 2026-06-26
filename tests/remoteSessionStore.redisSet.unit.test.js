/**
 * Unit tests: Redis Set tracking cho active session IDs.
 *
 * Xác nhận:
 *   - saveSession() gọi SADD vào remote:sessions
 *   - deleteSession() gọi SREM khỏi remote:sessions
 *   - getActiveSessionIds() dùng SMEMBERS + MGET thay vì SCAN
 *   - Stale Set members (session đã hết TTL) được tự động lọc và dọn
 */
process.env.NODE_ENV = "test";

jest.mock("../kernels/logging/appLogger", () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
}));

jest.mock("../models", () => ({
  sequelize: {
    query: jest.fn().mockRejectedValue(new Error("No DB in test")),
  },
}));

const { getSessionClient } = jest.requireMock("../kernels/redis/redisClients") || (() => {
  jest.mock("../kernels/redis/redisClients", () => ({
    getSessionClient: jest.fn(),
  }));
  return require("../kernels/redis/redisClients");
})();

jest.mock("../kernels/redis/redisClients", () => ({
  getSessionClient: jest.fn(),
}));

function makeRedisClient(overrides = {}) {
  return {
    status: "ready",
    connect: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue("OK"),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue([]),
    mget: jest.fn().mockResolvedValue([]),
    ttl: jest.fn().mockResolvedValue(7200),
    eval: jest.fn().mockResolvedValue(1),
    ...overrides,
  };
}

describe("Redis Set tracking — saveSession() gọi SADD", () => {
  let store;

  beforeEach(() => {
    jest.resetModules();
    jest.mock("../kernels/redis/redisClients", () => ({
      getSessionClient: jest.fn(),
    }));
    jest.mock("../models", () => ({
      sequelize: { query: jest.fn().mockRejectedValue(new Error("no db")) },
    }));
    jest.mock("../kernels/logging/appLogger", () => ({
      logInfo: jest.fn(),
      logWarn: jest.fn(),
    }));
    store = require("../kernels/remoteSession/remoteSessionStore");
  });

  test("saveSession() gọi sadd(SESSIONS_SET_KEY, sessionId) sau khi SET thành công", async () => {
    const client = makeRedisClient();
    require("../kernels/redis/redisClients").getSessionClient.mockReturnValue(client);

    const sessionId = "a".repeat(16);
    await store.saveSession(sessionId, {
      userId: 1,
      mqttPasswordToken: "tok",
      joinChallenge: "x".repeat(32),
    });

    // Đợi fire-and-forget SADD hoàn tất
    await new Promise((r) => setImmediate(r));

    expect(client.sadd).toHaveBeenCalledWith(store.SESSIONS_SET_KEY, sessionId);
  });

  test("saveSession() không gọi sadd nếu Redis SET lỗi", async () => {
    const client = makeRedisClient({
      set: jest.fn().mockRejectedValue(new Error("Redis SET failed")),
    });
    require("../kernels/redis/redisClients").getSessionClient.mockReturnValue(client);

    const sessionId = "b".repeat(16);
    await store.saveSession(sessionId, { userId: 2, mqttPasswordToken: "tok2" });

    await new Promise((r) => setImmediate(r));
    expect(client.sadd).not.toHaveBeenCalled();
  });
});

describe("Redis Set tracking — deleteSession() gọi SREM", () => {
  let store;

  beforeEach(() => {
    jest.resetModules();
    jest.mock("../kernels/redis/redisClients", () => ({
      getSessionClient: jest.fn(),
    }));
    jest.mock("../models", () => ({
      sequelize: { query: jest.fn().mockRejectedValue(new Error("no db")) },
    }));
    jest.mock("../kernels/logging/appLogger", () => ({
      logInfo: jest.fn(),
      logWarn: jest.fn(),
    }));
    store = require("../kernels/remoteSession/remoteSessionStore");
  });

  test("deleteSession() gọi srem(SESSIONS_SET_KEY, sessionId) khi DEL xóa được key", async () => {
    const sessionId = "c".repeat(16);
    const client = makeRedisClient({ del: jest.fn().mockResolvedValue(1) });
    require("../kernels/redis/redisClients").getSessionClient.mockReturnValue(client);

    await store.deleteSession(sessionId);

    await new Promise((r) => setImmediate(r));
    expect(client.srem).toHaveBeenCalledWith(store.SESSIONS_SET_KEY, sessionId);
  });

  test("deleteSession() không gọi srem khi DEL trả 0 (key không tồn tại)", async () => {
    const sessionId = "d".repeat(16);
    const client = makeRedisClient({ del: jest.fn().mockResolvedValue(0) });
    require("../kernels/redis/redisClients").getSessionClient.mockReturnValue(client);

    await store.deleteSession(sessionId);

    await new Promise((r) => setImmediate(r));
    expect(client.srem).not.toHaveBeenCalled();
  });
});

describe("Redis Set tracking — getActiveSessionIds() dùng SMEMBERS + MGET", () => {
  let store;

  beforeEach(() => {
    jest.resetModules();
    jest.mock("../kernels/redis/redisClients", () => ({
      getSessionClient: jest.fn(),
    }));
    jest.mock("../models", () => ({
      sequelize: { query: jest.fn().mockRejectedValue(new Error("no db")) },
    }));
    jest.mock("../kernels/logging/appLogger", () => ({
      logInfo: jest.fn(),
      logWarn: jest.fn(),
    }));
    store = require("../kernels/remoteSession/remoteSessionStore");
  });

  test("trả về danh sách session IDs từ SMEMBERS khi tất cả còn sống", async () => {
    const ids = ["a".repeat(16), "b".repeat(16)];
    const client = makeRedisClient({
      smembers: jest.fn().mockResolvedValue(ids),
      mget: jest.fn().mockResolvedValue(['{"userId":1}', '{"userId":2}']),
    });
    require("../kernels/redis/redisClients").getSessionClient.mockReturnValue(client);

    const result = await store.getActiveSessionIds();

    expect(client.smembers).toHaveBeenCalledWith(store.SESSIONS_SET_KEY);
    expect(client.mget).toHaveBeenCalledWith(
      `remote:session:${ids[0]}`,
      `remote:session:${ids[1]}`
    );
    expect(result).toEqual(ids);
  });

  test("lọc ra stale members (MGET trả null) và gọi SREM để dọn", async () => {
    const activeId = "a".repeat(16);
    const staleId = "b".repeat(16);
    const client = makeRedisClient({
      smembers: jest.fn().mockResolvedValue([activeId, staleId]),
      mget: jest.fn().mockResolvedValue(['{"userId":1}', null]),
    });
    require("../kernels/redis/redisClients").getSessionClient.mockReturnValue(client);

    const result = await store.getActiveSessionIds();

    expect(result).toEqual([activeId]);
    expect(result).not.toContain(staleId);

    await new Promise((r) => setImmediate(r));
    expect(client.srem).toHaveBeenCalledWith(store.SESSIONS_SET_KEY, staleId);
  });

  test("trả về [] khi Set rỗng (không gọi MGET)", async () => {
    const client = makeRedisClient({
      smembers: jest.fn().mockResolvedValue([]),
    });
    require("../kernels/redis/redisClients").getSessionClient.mockReturnValue(client);

    const result = await store.getActiveSessionIds();

    expect(result).toEqual([]);
    expect(client.mget).not.toHaveBeenCalled();
  });

  test("fallback sang MySQL khi SMEMBERS throw", async () => {
    const client = makeRedisClient({
      smembers: jest.fn().mockRejectedValue(new Error("Redis down")),
    });
    require("../kernels/redis/redisClients").getSessionClient.mockReturnValue(client);

    // MySQL cũng mock lỗi → kết quả là [] (in-memory fallback không có gì)
    const result = await store.getActiveSessionIds();
    expect(Array.isArray(result)).toBe(true);
  });

  test("không gọi SCAN — xác nhận SCAN không được sử dụng", async () => {
    const client = makeRedisClient({
      smembers: jest.fn().mockResolvedValue(["a".repeat(16)]),
      mget: jest.fn().mockResolvedValue(['{"userId":1}']),
      scan: jest.fn(),
    });
    require("../kernels/redis/redisClients").getSessionClient.mockReturnValue(client);

    await store.getActiveSessionIds();

    expect(client.scan).not.toHaveBeenCalled();
    expect(client.smembers).toHaveBeenCalledTimes(1);
  });
});
