process.env.NODE_ENV = "test";

const mockAppMetrics = { inc: jest.fn() };
jest.mock("../kernels/metrics/appMetrics", () => mockAppMetrics);

const mockLogWarn = jest.fn();
jest.mock("../kernels/logging/appLogger", () => ({ logWarn: mockLogWarn }));

const mockIsFirestoreCircuitOpen = jest.fn().mockResolvedValue(false);
const mockSetScenarioSyncStatus = jest.fn().mockResolvedValue(undefined);
jest.mock("../kernels/scenarioSyncStatus", () => ({
  isFirestoreCircuitOpen: mockIsFirestoreCircuitOpen,
  setScenarioSyncStatus: mockSetScenarioSyncStatus,
}));

const mockClient = {
  status: "ready",
  connect: jest.fn().mockResolvedValue(undefined),
  lpush: jest.fn().mockResolvedValue(1),
  rpoplpush: jest.fn().mockResolvedValue(null),
  lrem: jest.fn().mockResolvedValue(1),
  llen: jest.fn().mockResolvedValue(0),
  lrange: jest.fn().mockResolvedValue([]),
  set: jest.fn().mockResolvedValue("OK"),
  del: jest.fn().mockResolvedValue(1),
};

const mockGetOutboxClient = jest.fn().mockReturnValue(mockClient);
jest.mock("../kernels/redis/redisClients", () => ({
  getOutboxClient: mockGetOutboxClient,
}));

const sut = require("../kernels/scenarioSyncQueue");

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.status = "ready";
  mockClient.connect.mockResolvedValue(undefined);
  mockClient.lpush.mockResolvedValue(1);
  mockClient.rpoplpush.mockResolvedValue(null);
  mockClient.lrem.mockResolvedValue(1);
  mockClient.llen.mockResolvedValue(0);
  mockClient.lrange.mockResolvedValue([]);
  mockClient.set.mockResolvedValue("OK");
  mockClient.del.mockResolvedValue(1);
  mockGetOutboxClient.mockReturnValue(mockClient);
  mockIsFirestoreCircuitOpen.mockResolvedValue(false);
  mockSetScenarioSyncStatus.mockResolvedValue(undefined);
});

// ── parseMessage ─────────────────────────────────────────────────────────────

describe("parseMessage", () => {
  test("trả null khi raw là null/undefined/empty", () => {
    expect(sut.parseMessage(null)).toBeNull();
    expect(sut.parseMessage(undefined)).toBeNull();
    expect(sut.parseMessage("")).toBeNull();
  });

  test("trả null khi JSON không hợp lệ", () => {
    expect(sut.parseMessage("{not json}")).toBeNull();
  });

  test("trả null khi thiếu scenarioId hoặc action", () => {
    expect(sut.parseMessage(JSON.stringify({ scenarioId: "s1" }))).toBeNull();
    expect(sut.parseMessage(JSON.stringify({ action: "SYNC" }))).toBeNull();
  });

  test("trả object khi đủ trường bắt buộc", () => {
    const msg = { scenarioId: "s1", action: "SYNC_FIRESTORE", retryCount: 0 };
    expect(sut.parseMessage(JSON.stringify(msg))).toEqual(expect.objectContaining({ scenarioId: "s1", action: "SYNC_FIRESTORE" }));
  });
});

// ── ensureRedisReady ──────────────────────────────────────────────────────────

describe("ensureRedisReady (via enqueue)", () => {
  test("ném lỗi 503 khi không có redis client", async () => {
    mockGetOutboxClient.mockReturnValueOnce(null);
    await expect(sut.enqueue({ scenarioId: "s1", action: "SYNC_FIRESTORE" }))
      .rejects.toMatchObject({ statusCode: 503, code: "SCENARIO_OUTBOX_ENQUEUE_FAILED" });
  });

  test("gọi connect() khi client chưa sẵn sàng", async () => {
    mockClient.status = "connecting";
    await sut.enqueue({ scenarioId: "s1", action: "SYNC_FIRESTORE" });
    expect(mockClient.connect).toHaveBeenCalled();
  });

  test("connect() throw → ném lỗi 503 wrapped", async () => {
    mockClient.status = "connecting";
    mockClient.connect.mockRejectedValueOnce(new Error("conn fail"));
    await expect(sut.enqueue({ scenarioId: "s1", action: "SYNC_FIRESTORE" }))
      .rejects.toMatchObject({ statusCode: 503 });
  });
});

// ── enqueue ───────────────────────────────────────────────────────────────────

describe("enqueue", () => {
  test("circuit open → logWarn nhưng vẫn enqueue", async () => {
    mockIsFirestoreCircuitOpen.mockResolvedValueOnce(true);
    await sut.enqueue({ scenarioId: "s1", action: "SYNC_FIRESTORE" });
    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.stringContaining("circuit open"),
      expect.objectContaining({ scenarioId: "s1" })
    );
    expect(mockClient.lpush).toHaveBeenCalled();
  });

  test("circuit closed → không logWarn, gọi lpush", async () => {
    await sut.enqueue({ scenarioId: "s1", action: "SYNC_FIRESTORE" });
    expect(mockLogWarn).not.toHaveBeenCalled();
    expect(mockClient.lpush).toHaveBeenCalledWith(sut.QUEUE_KEY, expect.any(String));
  });

  test("gọi setScenarioSyncStatus với 'pending' khi có scenarioId", async () => {
    await sut.enqueue({ scenarioId: "s1", action: "SYNC_FIRESTORE" });
    expect(mockSetScenarioSyncStatus).toHaveBeenCalledWith("s1", "pending");
  });

  test("không gọi setScenarioSyncStatus khi thiếu scenarioId", async () => {
    await sut.enqueue({ action: "SYNC_FIRESTORE" });
    expect(mockSetScenarioSyncStatus).not.toHaveBeenCalled();
  });

  test("lpush throw → ném lỗi SCENARIO_OUTBOX_ENQUEUE_FAILED", async () => {
    mockClient.lpush.mockRejectedValueOnce(new Error("lpush fail"));
    await expect(sut.enqueue({ scenarioId: "s1", action: "SYNC_FIRESTORE" }))
      .rejects.toMatchObject({ code: "SCENARIO_OUTBOX_ENQUEUE_FAILED", statusCode: 503 });
  });
});

// ── enqueueSync / enqueueDelete ───────────────────────────────────────────────

describe("enqueueSync", () => {
  test("gọi lpush với action SYNC_FIRESTORE", async () => {
    await sut.enqueueSync("s1", [1, 2, 3]);
    const raw = mockClient.lpush.mock.calls[0][1];
    const msg = JSON.parse(raw);
    expect(msg.action).toBe("SYNC_FIRESTORE");
    expect(msg.scenarioId).toBe("s1");
    expect(Array.isArray(msg.content)).toBe(true);
  });

  test("content không phải array → dùng mảng rỗng", async () => {
    await sut.enqueueSync("s1", "not-array");
    const raw = mockClient.lpush.mock.calls[0][1];
    const msg = JSON.parse(raw);
    expect(msg.content).toEqual([]);
  });
});

describe("enqueueDelete", () => {
  test("gọi lpush với action DELETE_FIRESTORE", async () => {
    await sut.enqueueDelete("s1");
    const raw = mockClient.lpush.mock.calls[0][1];
    const msg = JSON.parse(raw);
    expect(msg.action).toBe("DELETE_FIRESTORE");
    expect(msg.scenarioId).toBe("s1");
  });
});

// ── claimBatch ────────────────────────────────────────────────────────────────

describe("claimBatch", () => {
  test("trả empty khi queue rỗng (rpoplpush trả null)", async () => {
    const { items, raws } = await sut.claimBatch();
    expect(items).toHaveLength(0);
    expect(raws).toHaveLength(0);
  });

  test("trả đúng items khi queue có phần tử hợp lệ", async () => {
    const raw1 = JSON.stringify({ scenarioId: "s1", action: "SYNC_FIRESTORE", retryCount: 0 });
    const raw2 = JSON.stringify({ scenarioId: "s2", action: "DELETE_FIRESTORE", retryCount: 0 });
    mockClient.rpoplpush
      .mockResolvedValueOnce(raw1)
      .mockResolvedValueOnce(raw2)
      .mockResolvedValueOnce(null);
    const { items, raws } = await sut.claimBatch(10);
    expect(items).toHaveLength(2);
    expect(raws).toHaveLength(2);
    expect(items[0].scenarioId).toBe("s1");
  });

  test("bỏ qua phần tử không parseable nhưng vẫn push vào raws", async () => {
    const invalid = "{broken json}";
    const valid = JSON.stringify({ scenarioId: "s1", action: "SYNC_FIRESTORE", retryCount: 0 });
    mockClient.rpoplpush
      .mockResolvedValueOnce(invalid)
      .mockResolvedValueOnce(valid)
      .mockResolvedValueOnce(null);
    const { items, raws } = await sut.claimBatch(10);
    expect(raws).toHaveLength(2);
    expect(items).toHaveLength(1);
  });

  test("giới hạn tối đa 50 items (clamp)", async () => {
    mockClient.rpoplpush.mockResolvedValue(null);
    await sut.claimBatch(200);
    expect(mockClient.rpoplpush).toHaveBeenCalledTimes(1);
  });
});

// ── ackBatch ──────────────────────────────────────────────────────────────────

describe("ackBatch", () => {
  test("no-op khi mảng rỗng", async () => {
    await sut.ackBatch([]);
    expect(mockClient.lrem).not.toHaveBeenCalled();
  });

  test("gọi lrem cho từng raw", async () => {
    await sut.ackBatch(["raw1", "raw2"]);
    expect(mockClient.lrem).toHaveBeenCalledTimes(2);
    expect(mockClient.lrem).toHaveBeenCalledWith(sut.PROCESSING_KEY, 1, "raw1");
    expect(mockClient.lrem).toHaveBeenCalledWith(sut.PROCESSING_KEY, 1, "raw2");
  });
});

// ── requeueBatch ──────────────────────────────────────────────────────────────

describe("requeueBatch", () => {
  test("no-op khi mảng rỗng", async () => {
    await sut.requeueBatch([]);
    expect(mockClient.lrem).not.toHaveBeenCalled();
  });

  test("dưới MAX_RETRY_COUNT → lpush lại queue với retryCount+1", async () => {
    const raw = JSON.stringify({ scenarioId: "s1", action: "SYNC_FIRESTORE", retryCount: 0 });
    await sut.requeueBatch([raw]);
    expect(mockClient.lrem).toHaveBeenCalledWith(sut.PROCESSING_KEY, 1, raw);
    const newRaw = mockClient.lpush.mock.calls[0][1];
    const newMsg = JSON.parse(newRaw);
    expect(newMsg.retryCount).toBe(1);
    expect(mockClient.lpush).toHaveBeenCalledWith(sut.QUEUE_KEY, newRaw);
  });

  test("đạt MAX_RETRY_COUNT → lpush vào DLQ + status failed + logWarn + metric", async () => {
    const raw = JSON.stringify({ scenarioId: "s1", action: "SYNC_FIRESTORE", retryCount: sut.MAX_RETRY_COUNT });
    await sut.requeueBatch([raw]);
    expect(mockClient.lpush).toHaveBeenCalledWith(sut.DLQ_KEY, raw);
    expect(mockSetScenarioSyncStatus).toHaveBeenCalledWith("s1", "failed");
    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.stringContaining("DLQ"),
      expect.objectContaining({ scenarioId: "s1", code: "SCENARIO_OUTBOX_DLQ_ALERT" })
    );
    expect(mockAppMetrics.inc).toHaveBeenCalledWith("scenario_outbox_dlq_alert_total");
  });

  test("raw không parseable → retryCount=0 → re-enqueue với retryCount=1", async () => {
    const raw = "{broken}";
    await sut.requeueBatch([raw]);
    const newMsg = JSON.parse(mockClient.lpush.mock.calls[0][1]);
    expect(newMsg.retryCount).toBe(1);
  });
});

// ── acquireOutboxLock ─────────────────────────────────────────────────────────

describe("acquireOutboxLock", () => {
  test("không có client → trả true (optimistic)", async () => {
    mockGetOutboxClient.mockReturnValueOnce(null);
    expect(await sut.acquireOutboxLock()).toBe(true);
  });

  test("client không ready → connect() trước khi set", async () => {
    mockClient.status = "connecting";
    await sut.acquireOutboxLock();
    expect(mockClient.connect).toHaveBeenCalled();
    expect(mockClient.set).toHaveBeenCalled();
  });

  test("connect() throw → trả false", async () => {
    mockClient.status = "connecting";
    mockClient.connect.mockRejectedValueOnce(new Error("conn fail"));
    expect(await sut.acquireOutboxLock()).toBe(false);
  });

  test("set trả 'OK' → trả true (lock acquired)", async () => {
    mockClient.set.mockResolvedValueOnce("OK");
    expect(await sut.acquireOutboxLock()).toBe(true);
    expect(mockClient.set).toHaveBeenCalledWith(sut.OUTBOX_LOCK_KEY, "1", "EX", expect.any(Number), "NX");
  });

  test("set trả null → trả false (lock già có)", async () => {
    mockClient.set.mockResolvedValueOnce(null);
    expect(await sut.acquireOutboxLock()).toBe(false);
  });
});

// ── releaseOutboxLock ─────────────────────────────────────────────────────────

describe("releaseOutboxLock", () => {
  test("không có client → noop", async () => {
    mockGetOutboxClient.mockReturnValueOnce(null);
    await sut.releaseOutboxLock();
    expect(mockClient.del).not.toHaveBeenCalled();
  });

  test("client không ready → noop", async () => {
    mockClient.status = "connecting";
    await sut.releaseOutboxLock();
    expect(mockClient.del).not.toHaveBeenCalled();
  });

  test("client ready → gọi del", async () => {
    await sut.releaseOutboxLock();
    expect(mockClient.del).toHaveBeenCalledWith(sut.OUTBOX_LOCK_KEY);
  });

  test("del throw → không re-throw", async () => {
    mockClient.del.mockRejectedValueOnce(new Error("del fail"));
    await expect(sut.releaseOutboxLock()).resolves.toBeUndefined();
  });
});

// ── getQueueLengths ───────────────────────────────────────────────────────────

describe("getQueueLengths", () => {
  test("trả đúng độ dài các hàng đợi", async () => {
    mockClient.llen
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    const result = await sut.getQueueLengths();
    expect(result).toEqual({ queue: 5, processing: 2, dlq: 1 });
  });
});

// ── peekDlq ───────────────────────────────────────────────────────────────────

describe("peekDlq", () => {
  test("trả mảng rỗng khi DLQ trống", async () => {
    mockClient.lrange.mockResolvedValueOnce([]);
    expect(await sut.peekDlq()).toEqual([]);
  });

  test("trả raw + parsed cho từng item", async () => {
    const raw1 = JSON.stringify({ scenarioId: "s1", action: "SYNC_FIRESTORE", retryCount: 5 });
    const raw2 = "{bad json}";
    mockClient.lrange.mockResolvedValueOnce([raw1, raw2]);
    const result = await sut.peekDlq(2);
    expect(result).toHaveLength(2);
    expect(result[0].raw).toBe(raw1);
    expect(result[0].parsed).not.toBeNull();
    expect(result[1].raw).toBe(raw2);
    expect(result[1].parsed).toBeNull();
  });
});

// ── removeFromDlq ─────────────────────────────────────────────────────────────

describe("removeFromDlq", () => {
  test("no-op khi raw rỗng/null", async () => {
    await sut.removeFromDlq(null);
    await sut.removeFromDlq("");
    expect(mockClient.lrem).not.toHaveBeenCalled();
  });

  test("gọi lrem với đúng args", async () => {
    const raw = JSON.stringify({ scenarioId: "s1", action: "SYNC" });
    await sut.removeFromDlq(raw);
    expect(mockClient.lrem).toHaveBeenCalledWith(sut.DLQ_KEY, 1, raw);
  });
});

// ── dequeueBatch (deprecated) ─────────────────────────────────────────────────

describe("dequeueBatch", () => {
  test("delegate sang claimBatch, trả items", async () => {
    const raw = JSON.stringify({ scenarioId: "s1", action: "SYNC_FIRESTORE", retryCount: 0 });
    mockClient.rpoplpush
      .mockResolvedValueOnce(raw)
      .mockResolvedValueOnce(null);
    const items = await sut.dequeueBatch(5);
    expect(Array.isArray(items)).toBe(true);
    expect(items[0].scenarioId).toBe("s1");
  });
});
