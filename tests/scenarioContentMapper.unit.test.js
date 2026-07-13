/**
 * scenarioContentMapper — ưu tiên Content MySQL (source of truth), Firestore chỉ là
 * fallback legacy. Chốt hành vi chống tái diễn bug "block edit biến mất khi sync rớt".
 */
const mockGetContent = jest.fn();
const mockGetStatus = jest.fn();

jest.mock("../modules/config/services/scenarioFirestoreService", () => ({
  getScenarioContentArray: (...args) => mockGetContent(...args),
}));
jest.mock("../kernels/scenarioSyncStatus", () => ({
  getScenarioSyncStatus: (...args) => mockGetStatus(...args),
}));

const {
  hasStoredMysqlContent,
  applyScenarioContent,
  attachScenarioContent,
  attachScenarioContentFromMap,
} = require("../modules/config/services/scenarioContentMapper");

beforeEach(() => {
  mockGetContent.mockReset().mockResolvedValue(null);
  mockGetStatus.mockReset().mockResolvedValue(null);
});

describe("hasStoredMysqlContent", () => {
  test("chuỗi JSON có dữ liệu → true", () => {
    expect(hasStoredMysqlContent({ Content: '[{"Type":"button"}]' })).toBe(true);
  });
  test('"[]" (user xóa hết block) vẫn là dữ liệu hợp lệ → true', () => {
    expect(hasStoredMysqlContent({ Content: "[]" })).toBe(true);
  });
  test("null / chuỗi rỗng / thiếu → false", () => {
    expect(hasStoredMysqlContent({ Content: null })).toBe(false);
    expect(hasStoredMysqlContent({ Content: "" })).toBe(false);
    expect(hasStoredMysqlContent({})).toBe(false);
  });
});

describe("applyScenarioContent — MySQL-first", () => {
  test("MySQL có Content → giữ nguyên, KHÔNG bị Firestore đè", () => {
    const out = { Id: "s1", Content: '[{"Type":"5directions","TxFormats":["NEW"]}]' };
    applyScenarioContent(out, [{ Type: "5directions", TxFormats: ["OLD"] }]);
    expect(out.Content).toContain("NEW");
    expect(out.Content).not.toContain("OLD");
  });

  test('MySQL "[]" → block đã xóa không được Firestore hồi sinh', () => {
    const out = { Id: "s1", Content: "[]" };
    applyScenarioContent(out, [{ Type: "button" }]);
    expect(out.Content).toBe("[]");
  });

  test("MySQL rỗng (legacy) → fallback Firestore", () => {
    const out = { Id: "s1", Content: null };
    applyScenarioContent(out, [{ Type: "button" }]);
    expect(JSON.parse(out.Content)).toEqual([{ Type: "button" }]);
  });

  test("cả hai rỗng → mảng rỗng", () => {
    const out = { Id: "s1", Content: "" };
    applyScenarioContent(out, null);
    expect(out.Content).toBe("[]");
  });
});

describe("attachScenarioContent", () => {
  test("MySQL có Content → KHÔNG round-trip Firestore", async () => {
    const out = await attachScenarioContent({ Id: "s1", Content: '[{"Type":"button"}]' });
    expect(out.Content).toBe('[{"Type":"button"}]');
    expect(mockGetContent).not.toHaveBeenCalled();
  });

  test("MySQL rỗng → đọc Firestore fallback", async () => {
    mockGetContent.mockResolvedValue([{ Type: "para" }]);
    const out = await attachScenarioContent({ Id: "s1", Content: "" });
    expect(JSON.parse(out.Content)).toEqual([{ Type: "para" }]);
    expect(mockGetContent).toHaveBeenCalledWith("s1");
  });

  test("gắn syncStatus khi có", async () => {
    mockGetStatus.mockResolvedValue("degraded");
    const out = await attachScenarioContent({ Id: "s1", Content: "[]" });
    expect(out.syncStatus).toBe("degraded");
  });
});

describe("attachScenarioContentFromMap", () => {
  test("MySQL có Content → bỏ qua map Firestore", () => {
    const map = new Map([["s1", [{ Type: "button", Name: "OLD" }]]]);
    const out = attachScenarioContentFromMap({ Id: "s1", Content: '[{"Name":"NEW"}]' }, map);
    expect(out.Content).toContain("NEW");
  });

  test("MySQL rỗng → dùng map Firestore", () => {
    const map = new Map([["s1", [{ Type: "button" }]]]);
    const out = attachScenarioContentFromMap({ Id: "s1", Content: null }, map);
    expect(JSON.parse(out.Content)).toEqual([{ Type: "button" }]);
  });
});
