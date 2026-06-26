process.env.NODE_ENV = "test";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.resetModules();
});

function freshModule() {
  jest.resetModules();
  // Mock factory để tránh tạo real ioredis connections
  jest.doMock("../kernels/redis/redisClientFactory", () => ({
    createRedisClient: jest.fn().mockImplementation(({ url }) => ({
      client: url ? { url, _isMock: true } : null,
      mode: url ? "redis" : "none",
    })),
  }));
  return require("../kernels/redis/redisClients");
}

describe("redisClients — singleton registry", () => {
  test("getOutboxClient: trả null khi không có URL nào", () => {
    delete process.env.SCENARIO_OUTBOX_REDIS_URL;
    delete process.env.SCENARIO_SYNC_REDIS_URL;
    delete process.env.SCHEDULER_SHARED_REDIS_URL;
    delete process.env.RATE_LIMIT_REDIS_URL;
    const { getOutboxClient } = freshModule();
    expect(getOutboxClient()).toBeNull();
  });

  test("getOutboxClient: trả client khi SCENARIO_OUTBOX_REDIS_URL đặt", () => {
    process.env.SCENARIO_OUTBOX_REDIS_URL = "redis://localhost:6379/1";
    const { getOutboxClient } = freshModule();
    const client = getOutboxClient();
    expect(client).not.toBeNull();
    expect(client._isMock).toBe(true);
  });

  test("getOutboxClient: singleton — gọi 2 lần trả cùng reference", () => {
    process.env.SCENARIO_OUTBOX_REDIS_URL = "redis://localhost:6379/1";
    const { getOutboxClient } = freshModule();
    const c1 = getOutboxClient();
    const c2 = getOutboxClient();
    expect(c1).toBe(c2);
  });

  test("getSessionClient: dùng REMOTE_SESSION_REDIS_URL", () => {
    process.env.REMOTE_SESSION_REDIS_URL = "redis://localhost:6379/2";
    const { getSessionClient } = freshModule();
    expect(getSessionClient()).not.toBeNull();
  });

  test("getSchedulerClient: fallback xuống RATE_LIMIT_REDIS_URL", () => {
    delete process.env.SCHEDULER_SHARED_REDIS_URL;
    delete process.env.SCENARIO_SYNC_REDIS_URL;
    process.env.RATE_LIMIT_REDIS_URL = "redis://localhost:6379/3";
    const { getSchedulerClient } = freshModule();
    const client = getSchedulerClient();
    expect(client).not.toBeNull();
    expect(client.url).toBe("redis://localhost:6379/3");
  });

  test("getAuthCleanupClient: trả null khi không URL", () => {
    delete process.env.SCHEDULER_SHARED_REDIS_URL;
    delete process.env.AUTH_CODE_CLEANUP_REDIS_URL;
    delete process.env.RATE_LIMIT_REDIS_URL;
    const { getAuthCleanupClient } = freshModule();
    expect(getAuthCleanupClient()).toBeNull();
  });

  test("_resetAllClientsForTests: reset singleton → getOutboxClient tạo lại client mới", () => {
    process.env.SCENARIO_OUTBOX_REDIS_URL = "redis://localhost:6379/4";
    const mod = freshModule();
    const c1 = mod.getOutboxClient();
    mod._resetAllClientsForTests();
    const c2 = mod.getOutboxClient();
    // Cả hai đều là mock, nhưng là các object khác nhau (tạo lại)
    expect(c2).not.toBe(c1);
    expect(c2).not.toBeNull();
  });

  test("resolveUrl: bỏ qua key trống, dùng key tiếp theo", () => {
    process.env.SCENARIO_OUTBOX_REDIS_URL = "  "; // chỉ khoảng trắng → bỏ qua
    process.env.SCENARIO_SYNC_REDIS_URL = "redis://fallback:6379";
    const { getOutboxClient } = freshModule();
    const client = getOutboxClient();
    expect(client).not.toBeNull();
    expect(client.url).toBe("redis://fallback:6379");
  });
});
