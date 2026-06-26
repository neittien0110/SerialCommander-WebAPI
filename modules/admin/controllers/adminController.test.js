process.env.NODE_ENV = "test";

require("rootpath")();

jest.mock("../services/adminService");
jest.mock("../../../kernels/metrics/appMetrics", () => ({
  formatPrometheusExposition: jest.fn(() => "# prometheus text"),
}));

const adminService = require("../services/adminService");
const appMetrics = require("../../../kernels/metrics/appMetrics");
const controller = require("./adminController");

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    type: jest.fn().mockReturnThis(),
    send: jest.fn(),
  };
}

describe("adminController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getSharedConfigs", () => {
    test("trả 200 với danh sách configs", async () => {
      adminService.getSharedConfigs.mockResolvedValue([{ id: 1 }]);
      const res = mockRes();
      await controller.getSharedConfigs({}, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0].configs).toEqual([{ id: 1 }]);
    });

    test("trả 500 khi service throw", async () => {
      adminService.getSharedConfigs.mockRejectedValue(new Error("db down"));
      const res = mockRes();
      await controller.getSharedConfigs({}, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].error.code).toBe("ADMIN_GET_SHARED_CONFIGS_FAILED");
    });
  });

  describe("deleteSharedConfig", () => {
    test("trả 200 khi xóa thành công", async () => {
      adminService.deleteSharedConfig.mockResolvedValue({ id: 5 });
      const req = { params: { id: "5" } };
      const res = mockRes();
      await controller.deleteSharedConfig(req, res);
      expect(adminService.deleteSharedConfig).toHaveBeenCalledWith("5");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test("trả 404 khi service throw (không tìm thấy)", async () => {
      adminService.deleteSharedConfig.mockRejectedValue(new Error("Không tìm thấy cấu hình chia sẻ"));
      const req = { params: { id: "999" } };
      const res = mockRes();
      await controller.deleteSharedConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json.mock.calls[0][0].error.code).toBe("ADMIN_DELETE_SHARED_CONFIG_FAILED");
    });
  });

  describe("approveSharedConfig", () => {
    test("trả 200 khi duyệt thành công", async () => {
      adminService.approveSharedConfig.mockResolvedValue({ id: 5, IsShared: true });
      const req = { params: { id: "5" } };
      const res = mockRes();
      await controller.approveSharedConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0].approved).toEqual({ id: 5, IsShared: true });
    });

    test("trả 404 khi service throw", async () => {
      adminService.approveSharedConfig.mockRejectedValue(new Error("Không tìm thấy cấu hình"));
      const req = { params: { id: "999" } };
      const res = mockRes();
      await controller.approveSharedConfig(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe("getSyncJobsOpsSummary", () => {
    test("trả 200 với summary", async () => {
      adminService.getSyncJobsOpsSummary.mockResolvedValue({ source: "redis_outbox" });
      const res = mockRes();
      await controller.getSyncJobsOpsSummary({}, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0].summary).toEqual({ source: "redis_outbox" });
    });

    test("trả 500 khi service throw", async () => {
      adminService.getSyncJobsOpsSummary.mockRejectedValue(new Error("redis down"));
      const res = mockRes();
      await controller.getSyncJobsOpsSummary({}, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].error.code).toBe("ADMIN_SYNC_JOBS_OPS_FAILED");
    });
  });

  describe("reconcileScenarioOutboxDlq", () => {
    test("clamp maxItems trong [1,50], mặc định 20 khi không truyền", async () => {
      adminService.reconcileScenarioOutboxDlq.mockResolvedValue({ processed: 0 });
      const req = { body: {} };
      const res = mockRes();
      await controller.reconcileScenarioOutboxDlq(req, res);
      expect(adminService.reconcileScenarioOutboxDlq).toHaveBeenCalledWith(20);
    });

    test("clamp maxItems vượt trần 50 → còn 50", async () => {
      adminService.reconcileScenarioOutboxDlq.mockResolvedValue({ processed: 0 });
      const req = { body: { maxItems: 999 } };
      const res = mockRes();
      await controller.reconcileScenarioOutboxDlq(req, res);
      expect(adminService.reconcileScenarioOutboxDlq).toHaveBeenCalledWith(50);
    });

    test("maxItems âm/0 → clamp về tối thiểu 1", async () => {
      adminService.reconcileScenarioOutboxDlq.mockResolvedValue({ processed: 0 });
      const req = { body: { maxItems: -5 } };
      const res = mockRes();
      await controller.reconcileScenarioOutboxDlq(req, res);
      expect(adminService.reconcileScenarioOutboxDlq).toHaveBeenCalledWith(1);
    });

    test("trả 500 khi service throw", async () => {
      adminService.reconcileScenarioOutboxDlq.mockRejectedValue(new Error("mysql down"));
      const req = { body: {} };
      const res = mockRes();
      await controller.reconcileScenarioOutboxDlq(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].error.code).toBe("ADMIN_DLQ_RECONCILE_FAILED");
    });
  });

  describe("getOpsAppMetrics", () => {
    test("trả JSON metrics khi không yêu cầu format=prometheus", async () => {
      const data = { gauges: { a: 1 }, counters: { b: 2 } };
      adminService.getOpsAppMetrics.mockResolvedValue(data);
      const req = { query: {} };
      const res = mockRes();
      await controller.getOpsAppMetrics(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0].metrics).toEqual(data);
      expect(appMetrics.formatPrometheusExposition).not.toHaveBeenCalled();
    });

    test("trả text/plain prometheus khi format=prometheus", async () => {
      const data = { gauges: { a: 1 }, counters: { b: 2 } };
      adminService.getOpsAppMetrics.mockResolvedValue(data);
      const req = { query: { format: "prometheus" } };
      const res = mockRes();
      await controller.getOpsAppMetrics(req, res);
      expect(appMetrics.formatPrometheusExposition).toHaveBeenCalledWith(data.gauges, data.counters);
      expect(res.type).toHaveBeenCalledWith("text/plain; charset=utf-8; version=0.0.4");
      expect(res.send).toHaveBeenCalledWith("# prometheus text");
    });

    test("trả 500 khi service throw", async () => {
      adminService.getOpsAppMetrics.mockRejectedValue(new Error("boom"));
      const req = { query: {} };
      const res = mockRes();
      await controller.getOpsAppMetrics(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].error.code).toBe("ADMIN_OPS_METRICS_FAILED");
    });
  });
});
