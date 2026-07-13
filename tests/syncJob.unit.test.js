process.env.NODE_ENV = "test";
process.env.SCENARIO_OUTBOX_POLL_MS = "100";

afterEach(() => jest.resetModules());

function freshMocks() {
  jest.resetModules();

  const appMetrics = { inc: jest.fn() };
  const logger = { logWarn: jest.fn(), logInfo: jest.fn() };

  const scenarioSyncQueue = {
    acquireOutboxLock: jest.fn().mockResolvedValue(true),
    claimBatch: jest.fn().mockResolvedValue({ items: [], raws: [] }),
    ackBatch: jest.fn().mockResolvedValue(undefined),
    requeueBatch: jest.fn().mockResolvedValue(undefined),
    releaseOutboxLock: jest.fn().mockResolvedValue(undefined),
    getQueueLengths: jest.fn().mockResolvedValue({ dlq: 0, queue: 0, processing: 0 }),
    ACTIONS: { SYNC_FIRESTORE: "sync_firestore", DELETE_FIRESTORE: "delete_firestore" },
  };

  const scenarioSyncStatus = {
    setScenarioSyncStatus: jest.fn().mockResolvedValue(undefined),
    recordFirestoreBatchSuccess: jest.fn(),
    recordFirestoreBatchFailure: jest.fn().mockResolvedValue(undefined),
  };

  const scenarioFirestore = {
    batchSaveScenarioContent: jest.fn().mockResolvedValue(undefined),
    batchDeleteScenarioContent: jest.fn().mockResolvedValue(undefined),
  };

  const reconcileDlqBatch = jest.fn().mockResolvedValue([]);

  const scenarioSyncWatermark = {
    markScenariosSynced: jest.fn().mockResolvedValue(undefined),
    reconcileUnsyncedScenarios: jest.fn().mockResolvedValue([]),
  };

  jest.doMock("../kernels/metrics/appMetrics", () => appMetrics);
  jest.doMock("../kernels/logging/appLogger", () => logger);
  jest.doMock("../kernels/scenarioSyncQueue", () => scenarioSyncQueue);
  jest.doMock("../kernels/scenarioSyncStatus", () => scenarioSyncStatus);
  jest.doMock("../modules/config/services/scenarioFirestoreService", () => scenarioFirestore);
  jest.doMock("../kernels/scenarioDlqReconcile", () => ({ reconcileDlqBatch }));
  jest.doMock("../kernels/scenarioSyncWatermark", () => scenarioSyncWatermark);

  const mod = require("../kernels/syncJob");
  return { mod, appMetrics, logger, scenarioSyncQueue, scenarioSyncStatus, scenarioFirestore, reconcileDlqBatch, scenarioSyncWatermark };
}

describe("syncJob — computeRetryDelayMs", () => {
  test("exponential backoff: failure=1 → POLL_MS", () => {
    const { mod } = freshMocks();
    expect(mod.__private.computeRetryDelayMs(1)).toBe(100); // 2^0 * 100
  });

  test("caps at MAX_RETRY_DELAY_MS", () => {
    const { mod } = freshMocks();
    // failure=100: 2^99 * 100 >> 30000, should cap
    expect(mod.__private.computeRetryDelayMs(100)).toBe(30000);
  });
});

describe("syncJob — processQueueBatch", () => {
  test("no-op khi không acquire lock", async () => {
    const { mod, scenarioSyncQueue } = freshMocks();
    scenarioSyncQueue.acquireOutboxLock.mockResolvedValue(false);
    await mod.processQueueBatch();
    expect(scenarioSyncQueue.claimBatch).not.toHaveBeenCalled();
  });

  test("no-op khi batch rỗng", async () => {
    const { mod, scenarioFirestore } = freshMocks();
    await mod.processQueueBatch();
    expect(scenarioFirestore.batchSaveScenarioContent).not.toHaveBeenCalled();
    expect(scenarioFirestore.batchDeleteScenarioContent).not.toHaveBeenCalled();
  });

  test("xử lý upsert batch đúng cách", async () => {
    const { mod, scenarioSyncQueue, scenarioFirestore, appMetrics, scenarioSyncWatermark } = freshMocks();
    scenarioSyncQueue.claimBatch.mockResolvedValue({
      items: [{ action: "sync_firestore", scenarioId: "s1", content: [{ cmd: "AT" }] }],
      raws: ["raw1"],
    });
    await mod.processQueueBatch();
    expect(scenarioFirestore.batchSaveScenarioContent).toHaveBeenCalledWith([
      { scenarioId: "s1", content: [{ cmd: "AT" }] },
    ]);
    expect(appMetrics.inc).toHaveBeenCalledWith("scenario_outbox_upserts_total", 1);
    expect(appMetrics.inc).toHaveBeenCalledWith("scenario_outbox_batches_total");
    // Watermark SyncedAt được ghi sau khi batch thành công
    expect(scenarioSyncWatermark.markScenariosSynced).toHaveBeenCalledWith([
      { action: "sync_firestore", scenarioId: "s1", content: [{ cmd: "AT" }] },
    ]);
  });

  test("batch lỗi → KHÔNG ghi watermark", async () => {
    const { mod, scenarioSyncQueue, scenarioFirestore, scenarioSyncWatermark } = freshMocks();
    scenarioSyncQueue.claimBatch.mockResolvedValue({
      items: [{ action: "sync_firestore", scenarioId: "s1", content: [] }],
      raws: ["raw1"],
    });
    scenarioFirestore.batchSaveScenarioContent.mockRejectedValue(new Error("Firestore down"));
    await mod.processQueueBatch();
    expect(scenarioSyncWatermark.markScenariosSynced).not.toHaveBeenCalled();
  });

  test("xử lý delete batch đúng cách", async () => {
    const { mod, scenarioSyncQueue, scenarioFirestore } = freshMocks();
    scenarioSyncQueue.claimBatch.mockResolvedValue({
      items: [{ action: "delete_firestore", scenarioId: "s2" }],
      raws: ["raw2"],
    });
    await mod.processQueueBatch();
    expect(scenarioFirestore.batchDeleteScenarioContent).toHaveBeenCalledWith(["s2"]);
  });

  test("log warn cho action không được hỗ trợ", async () => {
    const { mod, scenarioSyncQueue, logger } = freshMocks();
    scenarioSyncQueue.claimBatch.mockResolvedValue({
      items: [{ action: "unknown_action", scenarioId: "s3" }],
      raws: ["raw3"],
    });
    await mod.processQueueBatch();
    expect(logger.logWarn).toHaveBeenCalledWith(
      expect.stringContaining("Bỏ qua action"), expect.any(Object)
    );
  });

  test("error path: tăng consecutiveFailureCount và requeue", async () => {
    const { mod, scenarioSyncQueue, scenarioSyncStatus, appMetrics } = freshMocks();
    scenarioSyncQueue.claimBatch.mockResolvedValue({
      items: [{ action: "sync_firestore", scenarioId: "s1", content: [] }],
      raws: ["raw1"],
    });
    scenarioSyncQueue.acquireOutboxLock.mockResolvedValue(true);

    // Force error in Firestore
    jest.resetModules();
    const mocks = freshMocks();
    mocks.scenarioSyncQueue.claimBatch.mockResolvedValue({
      items: [{ action: "sync_firestore", scenarioId: "s1", content: [] }],
      raws: ["raw1"],
    });
    mocks.scenarioFirestore.batchSaveScenarioContent.mockRejectedValue(new Error("Firestore down"));

    await mocks.mod.processQueueBatch();

    expect(mocks.scenarioSyncQueue.requeueBatch).toHaveBeenCalledWith(["raw1"]);
    expect(mocks.appMetrics.inc).toHaveBeenCalledWith("scenario_outbox_batch_errors_total");
  });

  test("error path: log warn khi requeue itself fails", async () => {
    const { mod, scenarioSyncQueue, scenarioFirestore, logger } = freshMocks();
    scenarioSyncQueue.claimBatch.mockResolvedValue({
      items: [{ action: "sync_firestore", scenarioId: "s1", content: [] }],
      raws: ["raw1"],
    });
    scenarioFirestore.batchSaveScenarioContent.mockRejectedValue(new Error("Firestore down"));
    scenarioSyncQueue.requeueBatch.mockRejectedValue(new Error("requeue failed"));

    await mod.processQueueBatch();

    expect(logger.logWarn).toHaveBeenCalledWith(
      expect.stringContaining("requeue failed"), expect.any(Object)
    );
  });
});

describe("syncJob — DLQ alerting", () => {
  test("log warn + inc counter khi dlq >= threshold", async () => {
    process.env.SCENARIO_DLQ_ALERT_THRESHOLD = "1";
    process.env.SCENARIO_DLQ_RECONCILE_EVERY_POLLS = "1"; // trigger every poll

    const { mod, scenarioSyncQueue, logger, appMetrics, reconcileDlqBatch } = freshMocks();
    scenarioSyncQueue.getQueueLengths.mockResolvedValue({ dlq: 3, queue: 0, processing: 0 });
    reconcileDlqBatch.mockResolvedValue([{ outcome: "requeued" }, { outcome: "requeued" }]);

    await mod.processQueueBatch(); // batch rỗng → goes to finally → maybeReconcileDlq

    expect(logger.logWarn).toHaveBeenCalledWith(
      expect.stringContaining("DLQ depth exceeded"),
      expect.objectContaining({ dlq: 3 })
    );
    expect(appMetrics.inc).toHaveBeenCalledWith("scenario_outbox_dlq_alert_total");

    delete process.env.SCENARIO_DLQ_ALERT_THRESHOLD;
    delete process.env.SCENARIO_DLQ_RECONCILE_EVERY_POLLS;
  });

  test("log info khi reconcile kết quả có items", async () => {
    process.env.SCENARIO_DLQ_RECONCILE_EVERY_POLLS = "1";

    const { mod, scenarioSyncQueue, logger, reconcileDlqBatch } = freshMocks();
    scenarioSyncQueue.getQueueLengths.mockResolvedValue({ dlq: 2, queue: 0, processing: 0 });
    reconcileDlqBatch.mockResolvedValue([{ outcome: "requeued" }]);

    await mod.processQueueBatch();
    expect(logger.logInfo).toHaveBeenCalledWith(
      "[syncJob] DLQ reconciliation", expect.objectContaining({ processed: 1 })
    );

    delete process.env.SCENARIO_DLQ_RECONCILE_EVERY_POLLS;
  });
});

describe("syncJob — startScenarioOutboxWorker", () => {
  test("no-op trong NODE_ENV=test", () => {
    process.env.NODE_ENV = "test";
    const { mod, scenarioSyncQueue } = freshMocks();
    mod.startScenarioOutboxWorker();
    expect(scenarioSyncQueue.acquireOutboxLock).not.toHaveBeenCalled();
  });

  test("no-op khi SCENARIO_OUTBOX_WORKER_ENABLED=false", () => {
    process.env.SCENARIO_OUTBOX_WORKER_ENABLED = "false";
    const { mod, scenarioSyncQueue } = freshMocks();
    mod.startScenarioOutboxWorker();
    expect(scenarioSyncQueue.acquireOutboxLock).not.toHaveBeenCalled();
    delete process.env.SCENARIO_OUTBOX_WORKER_ENABLED;
  });
});
