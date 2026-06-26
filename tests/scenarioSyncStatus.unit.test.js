process.env.NODE_ENV = "test";

const mockLogWarn = jest.fn();
jest.mock("../kernels/logging/appLogger", () => ({ logWarn: mockLogWarn }));

const mockClient = {
  status: "ready",
  hset: jest.fn(),
  hget: jest.fn(),
  hmget: jest.fn(),
  hdel: jest.fn(),
  set: jest.fn(),
  get: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
};

const mockGetOutboxClient = jest.fn().mockReturnValue(mockClient);
jest.mock("../kernels/redis/redisClients", () => ({
  getOutboxClient: mockGetOutboxClient,
}));

const sut = require("../kernels/scenarioSyncStatus");

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.status = "ready";
  mockGetOutboxClient.mockReturnValue(mockClient);
  sut.resetCircuitForTests();
});

// ── getRedis (internal) tested via public functions ───────────────────────────

describe("setScenarioSyncStatus", () => {
  test("no-op khi scenarioId hoặc status trống", async () => {
    await sut.setScenarioSyncStatus("", "pending");
    await sut.setScenarioSyncStatus("s1", "");
    expect(mockClient.hset).not.toHaveBeenCalled();
  });

  test("no-op khi không có redis client", async () => {
    mockGetOutboxClient.mockReturnValueOnce(null);
    await sut.setScenarioSyncStatus("s1", "pending");
    expect(mockClient.hset).not.toHaveBeenCalled();
  });

  test("gọi client.hset với đúng args", async () => {
    await sut.setScenarioSyncStatus("s1", "pending");
    expect(mockClient.hset).toHaveBeenCalledWith("scenario:sync:status", "s1", "pending");
  });

  test("client.status !== ready → connect() trước khi hset", async () => {
    mockClient.status = "connecting";
    await sut.setScenarioSyncStatus("s1", "synced");
    expect(mockClient.connect).toHaveBeenCalled();
    expect(mockClient.hset).toHaveBeenCalled();
  });

  test("connect() throw → client null, không gọi hset", async () => {
    mockClient.status = "connecting";
    mockClient.connect.mockRejectedValueOnce(new Error("conn failed"));
    await sut.setScenarioSyncStatus("s1", "pending");
    expect(mockClient.hset).not.toHaveBeenCalled();
  });

  test("hset throw → logWarn, không re-throw", async () => {
    mockClient.hset.mockRejectedValueOnce(new Error("redis write fail"));
    await expect(sut.setScenarioSyncStatus("s1", "pending")).resolves.toBeUndefined();
    expect(mockLogWarn).toHaveBeenCalledWith(
      "[scenario-sync-status] hset failed",
      expect.objectContaining({ scenarioId: "s1" })
    );
  });
});

describe("getScenarioSyncStatus", () => {
  test("trả null khi không có scenarioId", async () => {
    expect(await sut.getScenarioSyncStatus("")).toBeNull();
  });

  test("trả null khi không có redis", async () => {
    mockGetOutboxClient.mockReturnValueOnce(null);
    expect(await sut.getScenarioSyncStatus("s1")).toBeNull();
  });

  test("trả status từ hget", async () => {
    mockClient.hget.mockResolvedValueOnce("synced");
    expect(await sut.getScenarioSyncStatus("s1")).toBe("synced");
  });

  test("hget throw → trả null", async () => {
    mockClient.hget.mockRejectedValueOnce(new Error("hget fail"));
    expect(await sut.getScenarioSyncStatus("s1")).toBeNull();
  });
});

describe("getScenarioSyncStatusBatch", () => {
  test("trả empty map khi danh sách rỗng", async () => {
    const map = await sut.getScenarioSyncStatusBatch([]);
    expect(map.size).toBe(0);
  });

  test("trả empty map khi không có redis", async () => {
    mockGetOutboxClient.mockReturnValueOnce(null);
    const map = await sut.getScenarioSyncStatusBatch(["s1", "s2"]);
    expect(map.size).toBe(0);
  });

  test("trả map với status cho từng id", async () => {
    mockClient.hmget.mockResolvedValueOnce(["pending", "synced"]);
    const map = await sut.getScenarioSyncStatusBatch(["s1", "s2"]);
    expect(map.get("s1")).toBe("pending");
    expect(map.get("s2")).toBe("synced");
  });

  test("bỏ qua id null trong danh sách", async () => {
    mockClient.hmget.mockResolvedValueOnce(["synced"]);
    const map = await sut.getScenarioSyncStatusBatch([null, "s1"]);
    expect(map.get("s1")).toBe("synced");
  });

  test("hmget throw → trả empty map", async () => {
    mockClient.hmget.mockRejectedValueOnce(new Error("fail"));
    const map = await sut.getScenarioSyncStatusBatch(["s1"]);
    expect(map.size).toBe(0);
  });
});

describe("clearScenarioSyncStatus", () => {
  test("no-op khi không có scenarioId", async () => {
    await sut.clearScenarioSyncStatus("");
    expect(mockClient.hdel).not.toHaveBeenCalled();
  });

  test("gọi hdel với đúng args", async () => {
    await sut.clearScenarioSyncStatus("s1");
    expect(mockClient.hdel).toHaveBeenCalledWith("scenario:sync:status", "s1");
  });

  test("hdel throw → không re-throw", async () => {
    mockClient.hdel.mockRejectedValueOnce(new Error("hdel fail"));
    await expect(sut.clearScenarioSyncStatus("s1")).resolves.toBeUndefined();
  });
});

describe("recordFirestoreBatchSuccess", () => {
  test("reset counter về 0", async () => {
    await sut.recordFirestoreBatchFailure();
    sut.recordFirestoreBatchSuccess();
    // Sau khi reset, failure 1 lần nữa không mở circuit
    mockClient.set.mockResolvedValue("OK");
    const opened = await sut.recordFirestoreBatchFailure();
    expect(opened).toBe(false);
  });
});

describe("recordFirestoreBatchFailure", () => {
  test("trả false khi chưa đạt threshold (5)", async () => {
    for (let i = 0; i < 4; i++) {
      const result = await sut.recordFirestoreBatchFailure();
      expect(result).toBe(false);
    }
  });

  test("trả true và set circuit key khi đạt threshold", async () => {
    mockClient.set.mockResolvedValue("OK");
    for (let i = 0; i < 4; i++) await sut.recordFirestoreBatchFailure();
    const result = await sut.recordFirestoreBatchFailure();
    expect(result).toBe(true);
    expect(mockClient.set).toHaveBeenCalledWith("sync:firestore:circuit_open", "1", "EX", 60);
    expect(mockLogWarn).toHaveBeenCalledWith(
      "[scenario-sync-status] Firestore circuit open",
      expect.any(Object)
    );
  });

  test("trả true khi đạt threshold + không có redis", async () => {
    mockGetOutboxClient.mockReturnValue(null);
    for (let i = 0; i < 5; i++) {
      await sut.recordFirestoreBatchFailure();
    }
    const result = await sut.recordFirestoreBatchFailure();
    expect(result).toBe(true);
  });

  test("set throw → vẫn trả true (noop)", async () => {
    mockClient.set.mockRejectedValueOnce(new Error("set fail"));
    for (let i = 0; i < 4; i++) await sut.recordFirestoreBatchFailure();
    const result = await sut.recordFirestoreBatchFailure();
    expect(result).toBe(true);
  });
});

describe("isFirestoreCircuitOpen", () => {
  test("trả false khi không có redis", async () => {
    mockGetOutboxClient.mockReturnValueOnce(null);
    expect(await sut.isFirestoreCircuitOpen()).toBe(false);
  });

  test("trả true khi get trả '1'", async () => {
    mockClient.get.mockResolvedValueOnce("1");
    expect(await sut.isFirestoreCircuitOpen()).toBe(true);
  });

  test("trả false khi get trả null", async () => {
    mockClient.get.mockResolvedValueOnce(null);
    expect(await sut.isFirestoreCircuitOpen()).toBe(false);
  });

  test("get throw → trả false", async () => {
    mockClient.get.mockRejectedValueOnce(new Error("get fail"));
    expect(await sut.isFirestoreCircuitOpen()).toBe(false);
  });
});
