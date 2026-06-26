process.env.NODE_ENV = "test";

require("rootpath")();

jest.mock("kernels/firebaseAdmin", () => ({
  getFirestore: jest.fn(),
  getAdmin: jest.fn(),
  isFirebaseReady: jest.fn(),
}));

const firebaseAdmin = require("kernels/firebaseAdmin");
const scenarioFirestore = require("modules/config/services/scenarioFirestoreService");

function makeDocChain({ exists = true, data = {} } = {}) {
  const docRef = {
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue({ exists, data: () => data }),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const batch = {
    set: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  };
  const db = {
    collection: jest.fn(() => ({
      doc: jest.fn(() => docRef),
    })),
    batch: jest.fn(() => batch),
    getAll: jest.fn(),
  };
  return { db, docRef, batch };
}

describe("scenarioFirestoreService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("saveScenarioContent ném 503 khi Firebase chưa sẵn sàng", async () => {
    firebaseAdmin.isFirebaseReady.mockReturnValue(false);

    await expect(
      scenarioFirestore.saveScenarioContent("sid-1", [{ Name: "a", Type: "t" }])
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  test("saveScenarioContent ghi Firestore thành công", async () => {
    firebaseAdmin.isFirebaseReady.mockReturnValue(true);
    const { db, batch } = makeDocChain();
    firebaseAdmin.getFirestore.mockReturnValue(db);
    firebaseAdmin.getAdmin.mockReturnValue({
      firestore: { FieldValue: { serverTimestamp: () => "__ts__" } },
    });

    await scenarioFirestore.saveScenarioContent("sid-2", [{ x: 1 }]);

    expect(batch.commit).toHaveBeenCalled();
  });

  test("saveScenarioContent chuẩn hóa content không phải mảng thành []", async () => {
    firebaseAdmin.isFirebaseReady.mockReturnValue(true);
    const { db, batch } = makeDocChain();
    firebaseAdmin.getFirestore.mockReturnValue(db);
    firebaseAdmin.getAdmin.mockReturnValue({
      firestore: { FieldValue: { serverTimestamp: () => "__ts__" } },
    });

    await scenarioFirestore.saveScenarioContent("sid-3", "not-array");

    expect(batch.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ content: [] })
    );
  });

  test("getScenarioContentArray trả null khi không có db", async () => {
    firebaseAdmin.getFirestore.mockReturnValue(null);

    const out = await scenarioFirestore.getScenarioContentArray("any");

    expect(out).toBeNull();
  });

  test("getScenarioContentArray trả null khi document không tồn tại", async () => {
    const { db } = makeDocChain({ exists: false });
    firebaseAdmin.getFirestore.mockReturnValue(db);

    const out = await scenarioFirestore.getScenarioContentArray("missing");

    expect(out).toBeNull();
  });

  test("getScenarioContentArray đọc content (lowercase) hoặc Content (legacy)", async () => {
    const { db: dbLower } = makeDocChain({
      exists: true,
      data: { content: [1] },
    });
    firebaseAdmin.getFirestore.mockReturnValue(dbLower);
    expect(await scenarioFirestore.getScenarioContentArray("a")).toEqual([1]);

    const { db: dbUpper } = makeDocChain({
      exists: true,
      data: { Content: [2] },
    });
    firebaseAdmin.getFirestore.mockReturnValue(dbUpper);
    expect(await scenarioFirestore.getScenarioContentArray("b")).toEqual([2]);

    const { db: dbBad } = makeDocChain({
      exists: true,
      data: { foo: "bar" },
    });
    firebaseAdmin.getFirestore.mockReturnValue(dbBad);
    expect(await scenarioFirestore.getScenarioContentArray("c")).toBeNull();
  });

  test("deleteScenarioContent no-op khi không có db", async () => {
    firebaseAdmin.getFirestore.mockReturnValue(null);

    await expect(scenarioFirestore.deleteScenarioContent("sid")).resolves.toBeUndefined();
  });

  test("batchGetScenarioContentArrays gom getAll theo chunk", async () => {
    const { db } = makeDocChain();
    firebaseAdmin.getFirestore.mockReturnValue(db);
    db.getAll.mockResolvedValueOnce([
      { id: "a", exists: true, data: () => ({ content: [1] }) },
      { id: "b", exists: false, data: () => ({}) },
    ]);

    const map = await scenarioFirestore.batchGetScenarioContentArrays(["a", "b"]);

    expect(db.collection).toHaveBeenCalled();
    expect(db.getAll).toHaveBeenCalledTimes(1);
    expect(db.getAll.mock.calls[0]).toHaveLength(2);
    expect(map.get("a")).toEqual([1]);
    expect(map.get("b")).toBeNull();
  });

  test("deleteScenarioContent xóa doc trong Firestore", async () => {
    const { db, batch } = makeDocChain();
    firebaseAdmin.getFirestore.mockReturnValue(db);

    await scenarioFirestore.deleteScenarioContent("sid-9");

    expect(batch.delete).toHaveBeenCalled();
    expect(batch.commit).toHaveBeenCalled();
  });
});
