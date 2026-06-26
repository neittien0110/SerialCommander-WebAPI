process.env.NODE_ENV = "test";

jest.mock("../modules/auth/services/authDomainService", () => ({
  cleanupExpiredAuthCodes: jest.fn(),
}));
jest.mock("../kernels/logging/appLogger", () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
}));
jest.mock("../kernels/jobs/redisJobLease", () => ({
  runScheduledWorkWithLease: jest.fn(),
}));
jest.mock("../kernels/redis/redisClients", () => ({
  getAuthCleanupClient: jest.fn().mockReturnValue(null),
}));

const { cleanupExpiredAuthCodes } = require("../modules/auth/services/authDomainService");
const { logInfo, logWarn } = require("../kernels/logging/appLogger");
const { runScheduledWorkWithLease } = require("../kernels/jobs/redisJobLease");
const { startAuthCodeCleanupJob, runOnce } = require("../kernels/jobs/authCodeCleanupJob");

beforeEach(() => jest.clearAllMocks());

describe("authCodeCleanupJob", () => {
  describe("runOnce", () => {
    test("gọi runScheduledWorkWithLease với đúng opts", async () => {
      runScheduledWorkWithLease.mockResolvedValue({ ran: true });
      await runOnce();
      expect(runScheduledWorkWithLease).toHaveBeenCalledWith(
        expect.objectContaining({ lockKey: "lock:auth_code_cleanup", logLabel: "auth-cleanup" }),
        expect.any(Function)
      );
    });

    test("worker gọi cleanupExpiredAuthCodes và log khi totalDeleted > 0", async () => {
      cleanupExpiredAuthCodes.mockResolvedValue({
        deletedExpiredVerification: 2,
        deletedExpiredReset: 1,
        deletedUsedVerification: 0,
        deletedUsedReset: 0,
        retentionDays: 7,
      });
      runScheduledWorkWithLease.mockImplementation(async (opts, worker) => {
        await worker();
        return { ran: true };
      });

      await runOnce();

      expect(cleanupExpiredAuthCodes).toHaveBeenCalled();
      expect(logInfo).toHaveBeenCalledWith(
        "[auth-cleanup] deleted expired codes",
        expect.objectContaining({ total_deleted: 3 })
      );
    });

    test("worker không log khi totalDeleted = 0", async () => {
      cleanupExpiredAuthCodes.mockResolvedValue({
        deletedExpiredVerification: 0,
        deletedExpiredReset: 0,
        deletedUsedVerification: 0,
        deletedUsedReset: 0,
      });
      runScheduledWorkWithLease.mockImplementation(async (opts, worker) => {
        await worker();
        return { ran: false };
      });

      await runOnce();

      expect(logInfo).not.toHaveBeenCalled();
    });

    test("bắt lỗi từ runScheduledWorkWithLease và log warn", async () => {
      runScheduledWorkWithLease.mockRejectedValue(new Error("redis timeout"));
      await expect(runOnce()).resolves.toBeUndefined();
      expect(logWarn).toHaveBeenCalledWith(
        "[auth-cleanup] failed",
        expect.objectContaining({ message: "redis timeout" })
      );
    });
  });

  describe("startAuthCodeCleanupJob", () => {
    test("no-op khi NODE_ENV=test", () => {
      process.env.NODE_ENV = "test";
      startAuthCodeCleanupJob();
      expect(runScheduledWorkWithLease).not.toHaveBeenCalled();
    });

    test("no-op khi AUTH_CODE_CLEANUP_ENABLED=false", () => {
      process.env.AUTH_CODE_CLEANUP_ENABLED = "false";
      startAuthCodeCleanupJob();
      expect(runScheduledWorkWithLease).not.toHaveBeenCalled();
      delete process.env.AUTH_CODE_CLEANUP_ENABLED;
    });

    test("no-op khi CI=true", () => {
      process.env.CI = "true";
      process.env.NODE_ENV = "test";
      startAuthCodeCleanupJob();
      expect(runScheduledWorkWithLease).not.toHaveBeenCalled();
      delete process.env.CI;
    });

    test("gọi runOnce + setInterval khi NODE_ENV=development", () => {
      process.env.NODE_ENV = "development";
      jest.useFakeTimers();
      runScheduledWorkWithLease.mockResolvedValue({});
      startAuthCodeCleanupJob();
      expect(runScheduledWorkWithLease).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(60 * 60 * 1000);
      expect(runScheduledWorkWithLease).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
      process.env.NODE_ENV = "test";
    });

    test("intervalMs dùng AUTH_CODE_CLEANUP_INTERVAL_MINUTES nếu hợp lệ", () => {
      process.env.NODE_ENV = "development";
      process.env.AUTH_CODE_CLEANUP_INTERVAL_MINUTES = "30";
      jest.useFakeTimers();
      runScheduledWorkWithLease.mockResolvedValue({});
      startAuthCodeCleanupJob();
      jest.advanceTimersByTime(30 * 60 * 1000);
      expect(runScheduledWorkWithLease).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
      delete process.env.AUTH_CODE_CLEANUP_INTERVAL_MINUTES;
      process.env.NODE_ENV = "test";
    });
  });
});
