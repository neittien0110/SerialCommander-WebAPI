process.env.NODE_ENV = "test";

jest.mock("../kernels/logging/appLogger", () => ({ logWarn: jest.fn() }));
jest.mock("../kernels/remoteSession/remoteSessionMemoryStore", () => ({
  isProductionEnv: jest.fn().mockReturnValue(false),
}));

const mockQuery = jest.fn();
jest.mock("../models", () => ({
  sequelize: { query: mockQuery },
}));
jest.mock("sequelize", () => ({
  QueryTypes: { SELECT: "SELECT" },
}));

const { logWarn } = require("../kernels/logging/appLogger");
const { isProductionEnv } = require("../kernels/remoteSession/remoteSessionMemoryStore");
const { dbSaveSession, dbGetSession, dbGetActiveSessionIds, dbDeleteSession } = require("../kernels/remoteSession/remoteSessionDbFallback");

beforeEach(() => jest.clearAllMocks());

describe("remoteSessionDbFallback", () => {
  describe("dbSaveSession", () => {
    test("gọi sequelize.query với INSERT...ON DUPLICATE KEY UPDATE", async () => {
      mockQuery.mockResolvedValue([]);
      await dbSaveSession("abcd1234", {
        userId: 42,
        mqttPasswordToken: "tok",
        joinChallenge: "chall",
      }, 3600);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO remote_sessions"),
        expect.objectContaining({
          replacements: expect.objectContaining({ sessionId: "abcd1234", userId: 42 }),
        })
      );
    });

    test("joinChallenge null khi không truyền", async () => {
      mockQuery.mockResolvedValue([]);
      await dbSaveSession("s1", { userId: 1, mqttPasswordToken: "t" }, 100);
      const [, opts] = mockQuery.mock.calls[0];
      expect(opts.replacements.joinChallenge).toBeNull();
    });
  });

  describe("dbGetSession", () => {
    test("trả row khi tìm thấy, không log warn (dev env)", async () => {
      mockQuery.mockResolvedValue([{ userId: 5, mqttPasswordToken: "tok", joinChallenge: "c" }]);
      const result = await dbGetSession("abcd1234");
      expect(result).toEqual({ userId: 5, mqttPasswordToken: "tok", joinChallenge: "c" });
      expect(logWarn).not.toHaveBeenCalled();
    });

    test("log warn CRITICAL DEGRADE khi production env và tìm thấy session", async () => {
      isProductionEnv.mockReturnValue(true);
      mockQuery.mockResolvedValue([{ userId: 5, mqttPasswordToken: "tok", joinChallenge: null }]);
      await dbGetSession("abcd1234");
      expect(logWarn).toHaveBeenCalledWith(
        expect.stringContaining("CRITICAL DEGRADE"),
        expect.objectContaining({ sessionId: "abcd1234" })
      );
      isProductionEnv.mockReturnValue(false);
    });

    test("trả null khi không tìm thấy (rows rỗng)", async () => {
      mockQuery.mockResolvedValue([]);
      const result = await dbGetSession("not-found");
      expect(result).toBeNull();
    });

    test("trả null và không throw khi query throw (bảng chưa tồn tại)", async () => {
      mockQuery.mockRejectedValue(new Error("Table 'remote_sessions' doesn't exist"));
      const result = await dbGetSession("abcd");
      expect(result).toBeNull();
    });
  });

  describe("dbGetActiveSessionIds", () => {
    test("trả danh sách sessionId từ DB", async () => {
      mockQuery.mockResolvedValue([{ sessionId: "abc" }, { sessionId: "def" }]);
      const result = await dbGetActiveSessionIds();
      expect(result).toEqual(["abc", "def"]);
    });

    test("trả [] khi rows rỗng", async () => {
      mockQuery.mockResolvedValue([]);
      expect(await dbGetActiveSessionIds()).toEqual([]);
    });

    test("trả [] khi query throw", async () => {
      mockQuery.mockRejectedValue(new Error("DB error"));
      expect(await dbGetActiveSessionIds()).toEqual([]);
    });
  });

  describe("dbDeleteSession", () => {
    test("gọi DELETE query", async () => {
      mockQuery.mockResolvedValue([]);
      await dbDeleteSession("abcd1234");
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM remote_sessions"),
        expect.objectContaining({ replacements: { sessionId: "abcd1234" } })
      );
    });

    test("không throw khi query throw", async () => {
      mockQuery.mockRejectedValue(new Error("table missing"));
      await expect(dbDeleteSession("x")).resolves.toBeUndefined();
    });
  });
});
