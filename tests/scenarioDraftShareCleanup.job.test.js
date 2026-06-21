process.env.NODE_ENV = "test";

require("rootpath")();

jest.mock("modules/config/services/scenarioDraftShareService", () => ({
  cleanupExpiredDraftShares: jest.fn(),
}));

jest.mock("kernels/logging/appLogger", () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
}));

const { cleanupExpiredDraftShares } = require("modules/config/services/scenarioDraftShareService");
const appLogger = require("kernels/logging/appLogger");
const { runOnce, startScenarioDraftShareCleanupJob } = require("kernels/jobs/scenarioDraftShareCleanupJob");

describe("scenarioDraftShareCleanupJob", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("runOnce logs khi có bản ghi bị xoá", async () => {
    cleanupExpiredDraftShares.mockResolvedValue(2);

    await runOnce();

    expect(appLogger.logInfo).toHaveBeenCalled();
  });

  test("runOnce không log khi không có gì để xoá", async () => {
    cleanupExpiredDraftShares.mockResolvedValue(0);

    await runOnce();

    expect(appLogger.logInfo).not.toHaveBeenCalled();
  });

  test("runOnce warn khi service lỗi", async () => {
    cleanupExpiredDraftShares.mockRejectedValue(new Error("db down"));

    await runOnce();

    expect(appLogger.logWarn).toHaveBeenCalled();
  });

  test("startScenarioDraftShareCleanupJob skip ở môi trường test", () => {
    startScenarioDraftShareCleanupJob();

    expect(cleanupExpiredDraftShares).not.toHaveBeenCalled();
  });
});
