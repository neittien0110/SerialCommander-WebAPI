jest.mock("../../../models", () => ({
  Scenario: {
    findOne: jest.fn(),
  },
}));
jest.mock("uuid", () => ({ v4: jest.fn().mockReturnValue("aabbccdd-1122-3344-5566-778899aabbcc") }));
jest.mock("./scenarioContentMapper", () => ({
  attachScenarioContent: jest.fn().mockImplementation((s) => Promise.resolve(s)),
}));

const { Scenario } = require("../../../models");
const { attachScenarioContent } = require("./scenarioContentMapper");
const { generateShareCode, shareScenario, isShareCodeAvailable, getScenarioByShareCode } = require("./scenarioSharing");

beforeEach(() => jest.clearAllMocks());

describe("scenarioSharing", () => {
  describe("generateShareCode", () => {
    test("trả chuỗi 12 ký tự, không có dấu gạch ngang", () => {
      const code = generateShareCode();
      expect(code).toHaveLength(12);
      expect(code).not.toContain("-");
    });
  });

  describe("shareScenario", () => {
    test("404 khi không tìm thấy scenario", async () => {
      Scenario.findOne.mockResolvedValue(null);
      await expect(shareScenario("s1", 1)).rejects.toMatchObject({ statusCode: 404 });
    });

    test("toggle IsShared false→true, save và trả scenario", async () => {
      const mockSave = jest.fn().mockResolvedValue(undefined);
      const scenario = { IsShared: false, ShareCode: null, save: mockSave };
      Scenario.findOne.mockResolvedValue(scenario);

      const result = await shareScenario("s1", 1);
      expect(result.IsShared).toBe(true);
      expect(typeof result.ShareCode).toBe("string");
      expect(mockSave).toHaveBeenCalled();
    });

    test("toggle IsShared true→false, save (tanpa ShareCode)", async () => {
      const mockSave = jest.fn().mockResolvedValue(undefined);
      const scenario = { IsShared: true, ShareCode: "old123", save: mockSave };
      Scenario.findOne.mockResolvedValue(scenario);

      const result = await shareScenario("s1", 1);
      expect(result.IsShared).toBe(false);
      expect(mockSave).toHaveBeenCalled();
    });

    test("retry khi SequelizeUniqueConstraintError, thành công lần 2", async () => {
      let callCount = 0;
      const mockSave = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const err = new Error("dup");
          err.name = "SequelizeUniqueConstraintError";
          throw err;
        }
        return Promise.resolve();
      });
      const scenario = { IsShared: false, ShareCode: null, save: mockSave };
      Scenario.findOne.mockResolvedValue(scenario);

      const result = await shareScenario("s1", 1);
      expect(result.IsShared).toBe(true);
      expect(mockSave).toHaveBeenCalledTimes(2);
    });

    test("503 khi tất cả 5 lần thử đều SequelizeUniqueConstraintError", async () => {
      const dupErr = new Error("dup");
      dupErr.name = "SequelizeUniqueConstraintError";
      const mockSave = jest.fn().mockRejectedValue(dupErr);
      const scenario = { IsShared: false, ShareCode: null, save: mockSave };
      Scenario.findOne.mockResolvedValue(scenario);

      await expect(shareScenario("s1", 1)).rejects.toMatchObject({ statusCode: 503 });
      expect(mockSave).toHaveBeenCalledTimes(5);
    });

    test("propagate lỗi không phải UniqueConstraint ngay lập tức", async () => {
      const boom = new Error("db error");
      boom.name = "SequelizeConnectionError";
      const mockSave = jest.fn().mockRejectedValue(boom);
      const scenario = { IsShared: false, ShareCode: null, save: mockSave };
      Scenario.findOne.mockResolvedValue(scenario);

      await expect(shareScenario("s1", 1)).rejects.toThrow("db error");
      expect(mockSave).toHaveBeenCalledTimes(1);
    });
  });

  describe("isShareCodeAvailable", () => {
    test("trả true khi tìm thấy row", async () => {
      Scenario.findOne.mockResolvedValue({ Id: 1 });
      expect(await isShareCodeAvailable("abc123")).toBe(true);
    });

    test("trả false khi không tìm thấy", async () => {
      Scenario.findOne.mockResolvedValue(null);
      expect(await isShareCodeAvailable("nope")).toBe(false);
    });
  });

  describe("getScenarioByShareCode", () => {
    test("404 khi không tìm thấy", async () => {
      Scenario.findOne.mockResolvedValue(null);
      await expect(getScenarioByShareCode("bad")).rejects.toMatchObject({ statusCode: 404 });
    });

    test("trả {dataValues: enriched} khi tìm thấy", async () => {
      const raw = { Id: 1, Name: "S", Content: "[]" };
      Scenario.findOne.mockResolvedValue(raw);
      attachScenarioContent.mockResolvedValue({ ...raw, Content: [] });

      const result = await getScenarioByShareCode("abc123");
      expect(result).toHaveProperty("dataValues");
      expect(result.dataValues.Id).toBe(1);
    });
  });
});
