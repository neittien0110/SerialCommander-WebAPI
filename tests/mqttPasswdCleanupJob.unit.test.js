process.env.NODE_ENV = "test";

jest.mock("../kernels/remoteSession/mosquittoPasswdSync", () => ({
  cleanupExpiredUsers: jest.fn(),
}));
jest.mock("../kernels/remoteSession/remoteSessionStore", () => ({
  getActiveSessionIds: jest.fn().mockReturnValue([]),
}));
jest.mock("../kernels/logging/appLogger", () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

const { cleanupExpiredUsers } = require("../kernels/remoteSession/mosquittoPasswdSync");
const { getActiveSessionIds } = require("../kernels/remoteSession/remoteSessionStore");
const { logError } = require("../kernels/logging/appLogger");
const { runCleanupOnce, startMqttPasswdCleanupJob } = require("../kernels/jobs/mqttPasswdCleanupJob");

beforeEach(() => jest.clearAllMocks());

describe("mqttPasswdCleanupJob", () => {
  describe("runCleanupOnce", () => {
    test("gọi cleanupExpiredUsers với getActiveSessionIds", async () => {
      cleanupExpiredUsers.mockResolvedValue(undefined);
      await runCleanupOnce();
      expect(cleanupExpiredUsers).toHaveBeenCalledWith(getActiveSessionIds);
    });

    test("bắt lỗi từ cleanupExpiredUsers, log và không throw", async () => {
      cleanupExpiredUsers.mockRejectedValue(new Error("broker down"));
      await expect(runCleanupOnce()).resolves.toBeUndefined();
      expect(logError).toHaveBeenCalledWith(
        "[mqttPasswdCleanupJob] Lỗi khi dọn dẹp passwd",
        expect.objectContaining({ message: "broker down" })
      );
    });
  });

  describe("startMqttPasswdCleanupJob", () => {
    test("trả về ngay lập tức (no-op) khi NODE_ENV=test", () => {
      // Không set interval, không throw
      expect(() => startMqttPasswdCleanupJob()).not.toThrow();
      expect(cleanupExpiredUsers).not.toHaveBeenCalled();
    });
  });
});
