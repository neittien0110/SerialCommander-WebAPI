process.env.NODE_ENV = "test";

require("rootpath")();

jest.mock("kernels/scenarioSyncQueue", () => ({
  getQueueLengths: jest.fn(),
  peekDlq: jest.fn(),
}));

jest.mock("kernels/scenarioDlqReconcile", () => ({
  reconcileDlqBatch: jest.fn(),
}));

jest.mock("models", () => ({
  Scenario: {
    findAll: jest.fn(),
    findByPk: jest.fn(),
  },
}));

const { Scenario } = require("models");
const adminService = require("./adminService");

describe("adminService — shared configs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getSharedConfigs", () => {
    test("trả về danh sách scenario có IsShared=true", async () => {
      const configs = [{ id: 1, IsShared: true }];
      Scenario.findAll.mockResolvedValue(configs);

      const out = await adminService.getSharedConfigs();

      expect(Scenario.findAll).toHaveBeenCalledWith({ where: { IsShared: true } });
      expect(out).toBe(configs);
    });
  });

  describe("deleteSharedConfig", () => {
    test("xóa thành công khi config tồn tại và đang shared", async () => {
      const config = { id: 1, IsShared: true, destroy: jest.fn().mockResolvedValue() };
      Scenario.findByPk.mockResolvedValue(config);

      const out = await adminService.deleteSharedConfig(1);

      expect(config.destroy).toHaveBeenCalled();
      expect(out).toBe(config);
    });

    test("throw khi không tìm thấy config", async () => {
      Scenario.findByPk.mockResolvedValue(null);
      await expect(adminService.deleteSharedConfig(999)).rejects.toThrow(
        "Không tìm thấy cấu hình chia sẻ"
      );
    });

    test("throw khi config tồn tại nhưng không phải shared", async () => {
      Scenario.findByPk.mockResolvedValue({ id: 1, IsShared: false, destroy: jest.fn() });
      await expect(adminService.deleteSharedConfig(1)).rejects.toThrow(
        "Không tìm thấy cấu hình chia sẻ"
      );
    });
  });

  describe("approveSharedConfig", () => {
    test("set IsShared=true cho config tồn tại", async () => {
      const config = { id: 1, IsShared: false, update: jest.fn().mockResolvedValue() };
      Scenario.findByPk.mockResolvedValue(config);

      const out = await adminService.approveSharedConfig(1);

      expect(config.update).toHaveBeenCalledWith({ IsShared: true });
      expect(out).toBe(config);
    });

    test("throw khi không tìm thấy config (không yêu cầu đang shared)", async () => {
      Scenario.findByPk.mockResolvedValue(null);
      await expect(adminService.approveSharedConfig(999)).rejects.toThrow(
        "Không tìm thấy cấu hình"
      );
    });
  });
});
