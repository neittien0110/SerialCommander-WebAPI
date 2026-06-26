process.env.NODE_ENV = "test";

require("rootpath")();

jest.mock("kernels/logging/appLogger", () => ({
  logWarn: jest.fn(),
}));

function makeRedisMock({ setResult = "OK", getReturns = null } = {}) {
  const calls = { set: [], get: [], del: [] };
  return {
    calls,
    client: {
      set: jest.fn(async (...args) => {
        calls.set.push(args);
        return setResult;
      }),
      get: jest.fn(async (key) => {
        calls.get.push(key);
        return getReturns;
      }),
      del: jest.fn(async (key) => {
        calls.del.push(key);
        return 1;
      }),
    },
  };
}

describe("redisJobLease", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = "test";
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("không Redis, không strict: chạy worker", async () => {
    const { runScheduledWorkWithLease } = require("kernels/jobs/redisJobLease");
    const worker = jest.fn(async () => {});

    const out = await runScheduledWorkWithLease(
      { getRedis: () => null, lockKey: "k", lockTtlMs: 1000, logLabel: "t" },
      worker
    );

    expect(out.ran).toBe(true);
    expect(worker).toHaveBeenCalled();
  });

  test("production + strict + không Redis: không chạy worker", async () => {
    process.env.NODE_ENV = "production";
    process.env.SCHEDULER_STRICT_REPLICA_MODE = "true";
    const { runScheduledWorkWithLease } = require("kernels/jobs/redisJobLease");
    const { logWarn: logWarnFromModule } = require("kernels/logging/appLogger");
    const worker = jest.fn(async () => {});

    const out = await runScheduledWorkWithLease(
      { getRedis: () => null, lockKey: "k", lockTtlMs: 1000, logLabel: "t" },
      worker
    );

    expect(out.ran).toBe(false);
    expect(out.skippedNoRedis).toBe(true);
    expect(worker).not.toHaveBeenCalled();
    expect(logWarnFromModule).toHaveBeenCalled();
  });

  test("SET NX thất bại: không chạy worker", async () => {
    const { client } = makeRedisMock({ setResult: null });
    const { runScheduledWorkWithLease } = require("kernels/jobs/redisJobLease");
    const worker = jest.fn(async () => {});

    const out = await runScheduledWorkWithLease(
      { getRedis: () => client, lockKey: "lock:x", lockTtlMs: 5000, logLabel: "t" },
      worker
    );

    expect(out.ran).toBe(false);
    expect(out.skippedLock).toBe(true);
    expect(worker).not.toHaveBeenCalled();
  });

  test("giữ lock OK: chạy worker rồi del khi get khớp", async () => {
    const { client, calls } = makeRedisMock({ setResult: "OK" });
    client.get.mockImplementation(async () => {
      const v = calls.set.length ? calls.set[0][1] : null;
      return v;
    });

    const { runScheduledWorkWithLease } = require("kernels/jobs/redisJobLease");
    const worker = jest.fn(async () => {});

    const out = await runScheduledWorkWithLease(
      { getRedis: () => client, lockKey: "lock:y", lockTtlMs: 5000, logLabel: "t" },
      worker
    );

    expect(out.ran).toBe(true);
    expect(worker).toHaveBeenCalled();
    expect(client.set).toHaveBeenCalled();
    expect(client.del).toHaveBeenCalledWith("lock:y");
  });

  test("Redis status=connecting: chờ ready event rồi chạy worker", async () => {
    const { runScheduledWorkWithLease } = require("kernels/jobs/redisJobLease");

    let capturedLockValue;
    const readyListeners = [];
    const client = {
      status: "connecting",
      once: jest.fn().mockImplementation((event, cb) => {
        if (event === "ready") readyListeners.push(cb);
      }),
      removeListener: jest.fn(),
      set: jest.fn().mockImplementation((key, val) => {
        capturedLockValue = val;
        return Promise.resolve("OK");
      }),
      get: jest.fn().mockImplementation(() => Promise.resolve(capturedLockValue)),
      del: jest.fn().mockResolvedValue(1),
    };

    const worker = jest.fn().mockResolvedValue(undefined);
    // Kích hoạt ready ngay sau khi once() được đăng ký
    setImmediate(() => readyListeners.forEach((cb) => cb()));

    const out = await runScheduledWorkWithLease(
      { getRedis: () => client, lockKey: "lock:conn", lockTtlMs: 5000, logLabel: "t" },
      worker
    );

    expect(out.ran).toBe(true);
    expect(worker).toHaveBeenCalled();
  });

  test("Redis connect() throw: fallback chạy worker không lock + log warn", async () => {
    const { runScheduledWorkWithLease } = require("kernels/jobs/redisJobLease");
    const { logWarn: logWarnMock } = require("kernels/logging/appLogger");

    const client = {
      status: "disconnected",
      connect: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    };

    const worker = jest.fn().mockResolvedValue(undefined);
    const out = await runScheduledWorkWithLease(
      { getRedis: () => client, lockKey: "lock:err", lockTtlMs: 5000, logLabel: "t" },
      worker
    );

    expect(out.ran).toBe(true);
    expect(worker).toHaveBeenCalled();
    expect(logWarnMock).toHaveBeenCalled();
  });

  test("unlock throw: log warn nhưng không propagate lỗi", async () => {
    const { runScheduledWorkWithLease } = require("kernels/jobs/redisJobLease");
    const { logWarn: logWarnMock } = require("kernels/logging/appLogger");

    let capturedLockValue;
    const client = {
      status: "ready",
      set: jest.fn().mockImplementation((key, val) => {
        capturedLockValue = val;
        return Promise.resolve("OK");
      }),
      get: jest.fn().mockImplementation(() => Promise.resolve(capturedLockValue)),
      del: jest.fn().mockRejectedValue(new Error("del failed")),
    };

    const out = await runScheduledWorkWithLease(
      { getRedis: () => client, lockKey: "lock:unlock-err", lockTtlMs: 5000, logLabel: "t" },
      jest.fn().mockResolvedValue(undefined)
    );

    expect(out.ran).toBe(true);
    expect(logWarnMock).toHaveBeenCalledWith(expect.stringContaining("unlock failed"), expect.any(Object));
  });
});
