const logInfoFn = jest.fn();
const logWarnFn = jest.fn();

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  jest.useRealTimers();
  process.env.NODE_ENV = "test";
});

function loadMod(cleanupFn) {
  jest.resetModules();
  jest.doMock("../modules/config/services/scenarioDraftShareService", () => ({
    cleanupExpiredDraftShares: cleanupFn,
  }));
  jest.doMock("../kernels/logging/appLogger", () => ({
    logInfo: logInfoFn,
    logWarn: logWarnFn,
  }));
  return require("../kernels/jobs/scenarioDraftShareCleanupJob");
}

describe("runOnce", () => {
  test("deleted > 0 → logInfo", async () => {
    const { runOnce } = loadMod(jest.fn().mockResolvedValue(5));
    await runOnce();
    expect(logInfoFn).toHaveBeenCalledWith(
      expect.stringContaining("scenarioDraftShareCleanupJob"),
      expect.objectContaining({ deleted: 5 })
    );
  });

  test("deleted = 0 → không logInfo", async () => {
    const { runOnce } = loadMod(jest.fn().mockResolvedValue(0));
    await runOnce();
    expect(logInfoFn).not.toHaveBeenCalled();
  });

  test("cleanupExpiredDraftShares throw → logWarn, không re-throw", async () => {
    const { runOnce } = loadMod(jest.fn().mockRejectedValue(new Error("db error")));
    await expect(runOnce()).resolves.toBeUndefined();
    expect(logWarnFn).toHaveBeenCalledWith(
      expect.stringContaining("Lỗi khi dọn dẹp"),
      expect.objectContaining({ message: "db error" })
    );
  });
});

describe("startScenarioDraftShareCleanupJob", () => {
  test("no-op trong NODE_ENV=test", () => {
    process.env.NODE_ENV = "test";
    const cleanupFn = jest.fn().mockResolvedValue(0);
    const { startScenarioDraftShareCleanupJob } = loadMod(cleanupFn);
    startScenarioDraftShareCleanupJob();
    expect(cleanupFn).not.toHaveBeenCalled();
  });

  test("gọi runOnce + setInterval khi NODE_ENV=development", () => {
    process.env.NODE_ENV = "development";
    jest.useFakeTimers();
    const cleanupFn = jest.fn().mockResolvedValue(0);
    const { startScenarioDraftShareCleanupJob } = loadMod(cleanupFn);
    startScenarioDraftShareCleanupJob();
    expect(cleanupFn).toHaveBeenCalledTimes(1); // initial runOnce
    jest.advanceTimersByTime(60 * 60 * 1000); // 1 hour
    expect(cleanupFn).toHaveBeenCalledTimes(2); // interval fires
  });
});
