process.env.NODE_ENV = "test";

require("rootpath")();

const { Op } = require("sequelize");

jest.mock("models", () => ({
  Scenario: {
    create: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    destroy: jest.fn(),
    update: jest.fn(),
  },
  sequelize: {
    transaction: jest.fn(),
  },
}));

jest.mock("modules/config/services/scenarioFirestoreService", () => ({
  saveScenarioContent: jest.fn(),
  deleteScenarioContent: jest.fn(),
  getScenarioContentArray: jest.fn(),
  batchGetScenarioContentArrays: jest.fn(),
  batchSaveScenarioContent: jest.fn(),
  batchDeleteScenarioContent: jest.fn(),
}));

jest.mock("kernels/scenarioSyncStatus", () => ({
  getScenarioSyncStatus: jest.fn().mockResolvedValue(null),
  getScenarioSyncStatusBatch: jest.fn().mockResolvedValue(new Map()),
  setScenarioSyncStatus: jest.fn(),
}));

jest.mock("modules/config/services/scenarioSyncEnqueue", () => ({
  enqueueScenarioFirestoreSync: jest.fn(),
}));

const { Scenario, sequelize } = require("models");
const scenarioFirestore = require("modules/config/services/scenarioFirestoreService");
const scenarioSyncEnqueue = require("modules/config/services/scenarioSyncEnqueue");
const scenarioService = require("modules/config/services/scenarioService");

const validPayload = {
  Name: "S1",
  Description: "d",
  Content: JSON.stringify([{ Name: "step", Type: "raw", List: null, DefaultValue: null }]),
  Parity: "none",
  StopBits: 1,
  DataBits: 8,
  FlowControl: "none",
  NewLine: "none",
  Banners: [],
};

function mockTx() {
  const tx = { commit: jest.fn(), rollback: jest.fn() };
  sequelize.transaction.mockResolvedValue(tx);
  return tx;
}

describe("scenarioService (outbox Redis queue)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Scenario.create.mockReset();
    Scenario.findOne.mockReset();
    Scenario.update.mockReset();
    Scenario.destroy.mockReset();
    sequelize.transaction.mockReset();
    scenarioFirestore.getScenarioContentArray.mockReset();
    scenarioSyncEnqueue.enqueueScenarioFirestoreSync.mockReset();
  });

  test("createScenario: commit MySQL rồi enqueue Redis outbox, không gọi Firestore trực tiếp", async () => {
    const tx = mockTx();
    Scenario.create.mockResolvedValue({
      Id: "new-id",
      UserId: "u1",
      Name: "S1",
      dataValues: { Id: "new-id", UserId: "u1", Name: "S1" },
    });
    scenarioSyncEnqueue.enqueueScenarioFirestoreSync.mockResolvedValue(undefined);

    const out = await scenarioService.createScenario("u1", validPayload);

    expect(tx.commit.mock.invocationCallOrder[0]).toBeLessThan(
      scenarioSyncEnqueue.enqueueScenarioFirestoreSync.mock.invocationCallOrder[0]
    );
    expect(scenarioSyncEnqueue.enqueueScenarioFirestoreSync).toHaveBeenCalledWith(
      "scenario_upsert",
      "new-id",
      { content: expect.any(Array) }
    );
    expect(tx.rollback).not.toHaveBeenCalled();
    expect(scenarioFirestore.saveScenarioContent).not.toHaveBeenCalled();
    expect(out.syncStatus).toBe("pending");
  });

  test("createScenario: lỗi MySQL trong transaction → rollback, không enqueue", async () => {
    const tx = mockTx();
    const dbErr = new Error("db down");
    Scenario.create.mockRejectedValue(dbErr);

    await expect(scenarioService.createScenario("u1", validPayload)).rejects.toThrow("db down");
    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
    expect(scenarioSyncEnqueue.enqueueScenarioFirestoreSync).not.toHaveBeenCalled();
  });

  test("updateScenario: lỗi MySQL trong transaction → rollback, không enqueue", async () => {
    const tx = mockTx();
    Scenario.findOne.mockResolvedValueOnce({
      Id: "sid",
      UserId: "u",
      Name: "Old",
      Description: "",
      Baudrate: null,
      Parity: "none",
      StopBits: 1,
      DataBits: 8,
      FlowControl: "none",
      NewLine: "none",
      Banner1: null,
      Banner2: null,
    });
    Scenario.update.mockRejectedValue(new Error("db full"));

    await expect(
      scenarioService.updateScenario("sid", "u", validPayload)
    ).rejects.toThrow();

    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
    expect(scenarioSyncEnqueue.enqueueScenarioFirestoreSync).not.toHaveBeenCalled();
  });

  test("updateScenario: enqueue sau commit, không gọi Firestore trực tiếp", async () => {
    mockTx();
    Scenario.findOne.mockResolvedValueOnce({
      Id: "sid",
      UserId: "u",
      Name: "Old",
      Description: "",
      Baudrate: null,
      Parity: "none",
      StopBits: 1,
      DataBits: 8,
      FlowControl: "none",
      NewLine: "none",
      Banner1: null,
      Banner2: null,
    });
    Scenario.update.mockResolvedValue([1]);
    scenarioSyncEnqueue.enqueueScenarioFirestoreSync.mockResolvedValue(undefined);

    const out = await scenarioService.updateScenario("sid", "u", validPayload);

    expect(out.updatedRows).toBe(1);
    expect(out.syncStatus).toBe("pending");
    expect(scenarioSyncEnqueue.enqueueScenarioFirestoreSync).toHaveBeenCalledWith(
      "scenario_upsert",
      "sid",
      { content: expect.any(Array) }
    );
    expect(scenarioFirestore.saveScenarioContent).not.toHaveBeenCalled();
  });

  test("updateScenario: enqueue lỗi SAU commit → không throw, trả syncStatus degraded", async () => {
    const tx = mockTx();
    Scenario.findOne.mockResolvedValueOnce({
      Id: "sid",
      UserId: "u",
      Name: "Old",
      Description: "",
      Baudrate: null,
      Parity: "none",
      StopBits: 1,
      DataBits: 8,
      FlowControl: "none",
      NewLine: "none",
      Banner1: null,
      Banner2: null,
    });
    Scenario.update.mockResolvedValue([1]);
    const enqueueErr = new Error("Redis outbox enqueue failed");
    enqueueErr.statusCode = 503;
    scenarioSyncEnqueue.enqueueScenarioFirestoreSync.mockRejectedValue(enqueueErr);

    const out = await scenarioService.updateScenario("sid", "u", validPayload);

    expect(out.updatedRows).toBe(1);
    expect(out.syncStatus).toBe("degraded");
    expect(tx.commit).toHaveBeenCalled();
    expect(tx.rollback).not.toHaveBeenCalled();
  });

  test("createScenario: enqueue lỗi SAU commit → không throw, syncStatus degraded", async () => {
    const tx = mockTx();
    Scenario.create.mockResolvedValue({
      Id: "new-id",
      UserId: "u1",
      Name: "S1",
      dataValues: { Id: "new-id", UserId: "u1", Name: "S1" },
    });
    const enqueueErr = new Error("Redis outbox enqueue failed");
    enqueueErr.statusCode = 503;
    scenarioSyncEnqueue.enqueueScenarioFirestoreSync.mockRejectedValue(enqueueErr);

    const out = await scenarioService.createScenario("u1", validPayload);

    expect(out.Id).toBe("new-id");
    expect(out.syncStatus).toBe("degraded");
    expect(tx.commit).toHaveBeenCalled();
    expect(tx.rollback).not.toHaveBeenCalled();
  });

  test("deleteScenario: commit transaction rồi enqueue Redis (Outbox pattern)", async () => {
    const tx = mockTx();
    Scenario.destroy.mockResolvedValue(1);
    scenarioSyncEnqueue.enqueueScenarioFirestoreSync.mockResolvedValue(undefined);

    const out = await scenarioService.deleteScenario("sid", "u");

    expect(out.deletedRows).toBe(1);
    expect(out.syncStatus).toBe("pending");
    expect(scenarioSyncEnqueue.enqueueScenarioFirestoreSync).toHaveBeenCalledWith(
      "scenario_delete",
      "sid",
      null
    );
    expect(tx.commit).toHaveBeenCalled();
    expect(scenarioFirestore.deleteScenarioContent).not.toHaveBeenCalled();
  });

  test("getScenarioById 404 khi không có bản ghi", async () => {
    Scenario.findOne.mockResolvedValue(null);

    await expect(scenarioService.getScenarioById("x", "u")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test("getScenariosByUserId: batch Firestore + pagination", async () => {
    Scenario.findAndCountAll = jest.fn().mockResolvedValue({
      rows: [
        { dataValues: { Id: "i1", UserId: "u", Name: "A", Content: "" } },
        { dataValues: { Id: "i2", UserId: "u", Name: "B", Content: "" } },
      ],
      count: 12,
    });
    scenarioFirestore.batchGetScenarioContentArrays.mockResolvedValue(
      new Map([
        ["i1", [{ k: 1 }]],
        ["i2", null],
      ])
    );

    const out = await scenarioService.getScenariosByUserId("u", { limit: 2, offset: 4 });

    expect(Scenario.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 2, offset: 4 })
    );
    expect(scenarioFirestore.batchGetScenarioContentArrays).toHaveBeenCalledWith(["i1", "i2"]);
    expect(scenarioFirestore.getScenarioContentArray).not.toHaveBeenCalled();
    expect(out.total).toBe(12);
    expect(out.limit).toBe(2);
    expect(out.offset).toBe(4);
    expect(JSON.parse(out.scenarios[0].Content)).toEqual([{ k: 1 }]);
    expect(JSON.parse(out.scenarios[1].Content)).toEqual([]);
  });

  test("getPublicScenarios: lọc IsShared=1 + tìm theo tên, không trả Content/UserId", async () => {
    Scenario.findAndCountAll = jest.fn().mockResolvedValue({
      rows: [
        {
          dataValues: {
            Id: "p1",
            Name: "Demo A",
            Description: "d",
            ShareCode: "abc123456789",
            ModifiedAt: new Date("2026-01-01"),
          },
        },
      ],
      count: 1,
    });

    const out = await scenarioService.getPublicScenarios({ search: "Demo", limit: 10, offset: 0 });

    expect(Scenario.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { IsShared: true, Name: { [Op.like]: "%Demo%" } },
        attributes: ["Id", "Name", "Description", "ShareCode", "ModifiedAt"],
        limit: 10,
        offset: 0,
      })
    );
    expect(out.total).toBe(1);
    expect(out.scenarios[0]).not.toHaveProperty("Content");
    expect(out.scenarios[0]).not.toHaveProperty("UserId");
    expect(out.scenarios[0].Name).toBe("Demo A");
  });

  test("getPublicScenarios: không có search → where chỉ lọc IsShared", async () => {
    Scenario.findAndCountAll = jest.fn().mockResolvedValue({ rows: [], count: 0 });

    const out = await scenarioService.getPublicScenarios({});

    expect(Scenario.findAndCountAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { IsShared: true } })
    );
    expect(out.total).toBe(0);
  });

  test("getPublicScenarios: limit tối đa 100, offset không âm", async () => {
    Scenario.findAndCountAll = jest.fn().mockResolvedValue({ rows: [], count: 0 });

    const out = await scenarioService.getPublicScenarios({ limit: 5000, offset: -5 });

    expect(out.limit).toBe(100);
    expect(out.offset).toBe(0);
  });

  test("shareScenario: share lần đầu sinh ShareCode 12 ký tự hex", async () => {
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const scenario = { IsShared: false, ShareCode: null, save: saveMock };
    Scenario.findOne.mockResolvedValue(scenario);

    const result = await scenarioService.shareScenario("id1", "user1");

    expect(result.IsShared).toBe(true);
    expect(result.ShareCode).toMatch(/^[a-f0-9]{12}$/);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  test("shareScenario: re-share sau khi unshare sinh ShareCode mới (rotate)", async () => {
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const scenario = { IsShared: false, ShareCode: "oldcode12345", save: saveMock };
    Scenario.findOne.mockResolvedValue(scenario);

    const result = await scenarioService.shareScenario("id1", "user1");

    expect(result.IsShared).toBe(true);
    expect(result.ShareCode).not.toBe("oldcode12345");
    expect(result.ShareCode).toMatch(/^[a-f0-9]{12}$/);
  });

  test("shareScenario: unshare giữ ShareCode cũ, không sinh mới", async () => {
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const scenario = { IsShared: true, ShareCode: "code12345678", save: saveMock };
    Scenario.findOne.mockResolvedValue(scenario);

    const result = await scenarioService.shareScenario("id1", "user1");

    expect(result.IsShared).toBe(false);
    expect(result.ShareCode).toBe("code12345678");
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  test("attachScenarioContent: ưu tiên Firestore, fallback []", async () => {
    Scenario.findOne.mockResolvedValueOnce({
      dataValues: {
        Id: "i1",
        UserId: "u",
        Name: "N",
        Content: "",
      },
    });
    scenarioFirestore.getScenarioContentArray.mockResolvedValueOnce([{ k: 1 }]);

    const row = await scenarioService.getScenarioById("i1", "u");

    expect(JSON.parse(row.Content)).toEqual([{ k: 1 }]);
  });
});

describe("normalizeScenarioPayload – Guide field", () => {
  const { normalizeScenarioPayload } = require("modules/config/services/scenarioValidation");

  it("trims and accepts a valid Guide string", () => {
    const result = normalizeScenarioPayload({ ...validPayload, Guide: "  ## Step 1\nConnect  " });
    expect(result.Guide).toBe("## Step 1\nConnect");
  });

  it("accepts undefined Guide as empty string", () => {
    const result = normalizeScenarioPayload({ ...validPayload });
    expect(result.Guide).toBe("");
  });

  it("accepts null Guide as empty string", () => {
    const result = normalizeScenarioPayload({ ...validPayload, Guide: null });
    expect(result.Guide).toBe("");
  });

  it("rejects Guide longer than 10000 chars", () => {
    const longGuide = "a".repeat(10001);
    expect(() => normalizeScenarioPayload({ ...validPayload, Guide: longGuide })).toThrow();
  });
});

describe("Guide survives createScenario round-trip", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("passes Guide to Scenario.create", async () => {
    const tx = { commit: jest.fn(), rollback: jest.fn() };
    sequelize.transaction.mockResolvedValue(tx);
    Scenario.create.mockResolvedValue({
      Id: "id1",
      dataValues: { Id: "id1", Name: "S1", Guide: "## Step 1" },
    });
    scenarioFirestore.getScenarioContentArray.mockResolvedValue(null);

    await scenarioService.createScenario("u1", { ...validPayload, Guide: "## Step 1" });

    const createCall = Scenario.create.mock.calls[0][0];
    expect(createCall.Guide).toBe("## Step 1");
  });

  it("passes Guide to Scenario.update", async () => {
    const tx = { commit: jest.fn(), rollback: jest.fn() };
    sequelize.transaction.mockResolvedValue(tx);
    Scenario.findOne.mockResolvedValue({ Id: "id1", dataValues: { Id: "id1" } });
    Scenario.update.mockResolvedValue([1]);
    scenarioFirestore.getScenarioContentArray.mockResolvedValue(null);

    await scenarioService.updateScenario("id1", "u1", { ...validPayload, Guide: "## Updated" });

    const updateCall = Scenario.update.mock.calls[0][0];
    expect(updateCall.Guide).toBe("## Updated");
  });

  it("stores null when Guide is empty string", async () => {
    const tx = { commit: jest.fn(), rollback: jest.fn() };
    sequelize.transaction.mockResolvedValue(tx);
    Scenario.create.mockResolvedValue({
      Id: "id2",
      dataValues: { Id: "id2", Name: "S2", Guide: null },
    });
    scenarioFirestore.getScenarioContentArray.mockResolvedValue(null);

    await scenarioService.createScenario("u1", { ...validPayload, Guide: "" });

    const createCall = Scenario.create.mock.calls[0][0];
    expect(createCall.Guide).toBeNull();
  });
});
