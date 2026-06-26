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
  Scenario: {},
}));

const scenarioSyncQueue = require("kernels/scenarioSyncQueue");
const { reconcileDlqBatch } = require("kernels/scenarioDlqReconcile");
const adminService = require("./adminService");

describe("adminService.reconcileScenarioOutboxDlq", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("chạy reconcile và trả về queue lengths trước/sau", async () => {
    scenarioSyncQueue.getQueueLengths
      .mockResolvedValueOnce({ queue: 5, processing: 1, dlq: 3 })
      .mockResolvedValueOnce({ queue: 5, processing: 1, dlq: 1 });
    reconcileDlqBatch.mockResolvedValue([{ scenarioId: "s1" }, { scenarioId: "s2" }]);

    const out = await adminService.reconcileScenarioOutboxDlq(10);

    expect(reconcileDlqBatch).toHaveBeenCalledWith(10);
    expect(out.processed).toBe(2);
    expect(out.results).toEqual([{ scenarioId: "s1" }, { scenarioId: "s2" }]);
    expect(out.queue_lengths_before).toEqual({ queue: 5, processing: 1, dlq: 3 });
    expect(out.queue_lengths_after).toEqual({ queue: 5, processing: 1, dlq: 1 });
  });

  test("dùng maxItems mặc định 20 khi không truyền", async () => {
    scenarioSyncQueue.getQueueLengths.mockResolvedValue({ queue: 0, processing: 0, dlq: 0 });
    reconcileDlqBatch.mockResolvedValue([]);

    await adminService.reconcileScenarioOutboxDlq();

    expect(reconcileDlqBatch).toHaveBeenCalledWith(20);
  });
});
