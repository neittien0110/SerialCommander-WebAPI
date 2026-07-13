/**
 * scenarioSyncWatermark — watermark SyncedAt + reconcile re-enqueue.
 * So sánh thuần giờ DB: mark SyncedAt = snapshot ModifiedAt của job, chỉ khi dòng
 * chưa bị sửa tiếp; reconcile quét SyncedAt NULL/cũ và re-enqueue từ Content MySQL.
 */
afterEach(() => jest.resetModules());

function freshMocks({ firebaseReady = true, circuitOpen = false } = {}) {
  jest.resetModules();

  const query = jest.fn().mockResolvedValue([]);
  const logger = { logWarn: jest.fn(), logInfo: jest.fn() };
  const enqueueSync = jest.fn().mockResolvedValue(undefined);
  const isFirestoreCircuitOpen = jest.fn().mockResolvedValue(circuitOpen);

  jest.doMock("../models", () => ({ sequelize: { query } }));
  jest.doMock("../kernels/logging/appLogger", () => logger);
  jest.doMock("../kernels/scenarioSyncQueue", () => ({
    enqueueSync,
    ACTIONS: { SYNC_FIRESTORE: "SYNC_FIRESTORE", DELETE_FIRESTORE: "DELETE_FIRESTORE" },
  }));
  jest.doMock("../kernels/scenarioSyncStatus", () => ({ isFirestoreCircuitOpen }));
  jest.doMock("../kernels/firebaseAdmin", () => ({ isFirebaseReady: () => firebaseReady }));

  const mod = require("../kernels/scenarioSyncWatermark");
  return { mod, query, logger, enqueueSync, isFirestoreCircuitOpen };
}

describe("markScenariosSynced", () => {
  test("job kèm modifiedAt → mark SyncedAt = snapshot dạng CHUỖI wall-time (không phải Date — tránh lệch múi giờ khi escape)", async () => {
    const { mod, query } = freshMocks();
    const iso = "2026-07-13T04:00:00.000Z";
    await mod.markScenariosSynced([
      { action: "SYNC_FIRESTORE", scenarioId: "s1", modifiedAt: iso },
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, opts] = query.mock.calls[0];
    expect(sql).toMatch(/SET SyncedAt = \?, ModifiedAt = ModifiedAt/);
    expect(sql).toMatch(/AND ModifiedAt = \?/);
    expect(opts.replacements).toEqual(["2026-07-13 04:00:00", "s1", "2026-07-13 04:00:00"]);
  });

  test("toDbWallTime: Date/ISO → 'YYYY-MM-DD HH:mm:ss', giá trị hỏng → null", () => {
    const { mod } = freshMocks();
    expect(mod.toDbWallTime("2026-07-13T04:00:00.000Z")).toBe("2026-07-13 04:00:00");
    expect(mod.toDbWallTime(new Date("2026-07-13T04:00:00.000Z"))).toBe("2026-07-13 04:00:00");
    expect(mod.toDbWallTime("oops")).toBeNull();
    expect(mod.toDbWallTime(null)).toBeNull();
  });

  test("job format cũ (không modifiedAt) → mark theo NOW() của DB", async () => {
    const { mod, query } = freshMocks();
    await mod.markScenariosSynced([{ action: "SYNC_FIRESTORE", scenarioId: "s1" }]);
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/SET SyncedAt = NOW\(\), ModifiedAt = ModifiedAt/);
  });

  test("bỏ qua job delete và job thiếu scenarioId", async () => {
    const { mod, query } = freshMocks();
    await mod.markScenariosSynced([
      { action: "DELETE_FIRESTORE", scenarioId: "s1" },
      { action: "SYNC_FIRESTORE" },
    ]);
    expect(query).not.toHaveBeenCalled();
  });

  test("lỗi DB không throw — best-effort, reconcile bù sau", async () => {
    const { mod, query, logger } = freshMocks();
    query.mockRejectedValue(new Error("db down"));
    await expect(
      mod.markScenariosSynced([{ action: "SYNC_FIRESTORE", scenarioId: "s1" }])
    ).resolves.toBeUndefined();
    expect(logger.logWarn).toHaveBeenCalled();
  });
});

describe("reconcileUnsyncedScenarios", () => {
  test("re-enqueue dòng chưa sync kèm snapshot ModifiedAt", async () => {
    const { mod, query, enqueueSync } = freshMocks();
    const modifiedAt = new Date("2026-07-13T03:00:00.000Z");
    query.mockResolvedValue([
      { Id: "s1", Content: '[{"Type":"button"}]', ModifiedAt: modifiedAt },
    ]);
    const results = await mod.reconcileUnsyncedScenarios();
    expect(enqueueSync).toHaveBeenCalledWith("s1", [{ Type: "button" }], modifiedAt);
    expect(results).toEqual([{ scenarioId: "s1", outcome: "requeued" }]);
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/SyncedAt IS NULL OR SyncedAt < ModifiedAt/);
    expect(sql).toMatch(/Content IS NOT NULL AND Content <> ''/);
  });

  test("Content hỏng → bỏ qua, không sync mảng rỗng đè Firestore", async () => {
    const { mod, query, enqueueSync } = freshMocks();
    query.mockResolvedValue([{ Id: "s1", Content: "{oops", ModifiedAt: new Date() }]);
    const results = await mod.reconcileUnsyncedScenarios();
    expect(enqueueSync).not.toHaveBeenCalled();
    expect(results[0].outcome).toBe("skipped_invalid_content");
  });

  test("Firebase tắt → không quét, không enqueue", async () => {
    const { mod, query, enqueueSync } = freshMocks({ firebaseReady: false });
    const results = await mod.reconcileUnsyncedScenarios();
    expect(results).toEqual([]);
    expect(query).not.toHaveBeenCalled();
    expect(enqueueSync).not.toHaveBeenCalled();
  });

  test("circuit Firestore đang mở → đợi, không enqueue thêm", async () => {
    const { mod, query } = freshMocks({ circuitOpen: true });
    const results = await mod.reconcileUnsyncedScenarios();
    expect(results).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  test("enqueue lỗi → ghi outcome error, không throw", async () => {
    const { mod, query, enqueueSync } = freshMocks();
    query.mockResolvedValue([{ Id: "s1", Content: "[]", ModifiedAt: new Date() }]);
    enqueueSync.mockRejectedValue(new Error("redis down"));
    const results = await mod.reconcileUnsyncedScenarios();
    expect(results[0]).toMatchObject({ scenarioId: "s1", outcome: "error" });
  });
});
