process.env.NODE_ENV = "test";

require("rootpath")();

jest.mock("models", () => ({
  UserActivity: {
    create: jest.fn(),
    findAndCountAll: jest.fn(),
    findAll: jest.fn(),
    count: jest.fn(),
    findOne: jest.fn(),
    destroy: jest.fn(),
  },
}));

const { UserActivity } = require("models");
const UserActivityService = require("./userActivityService");

describe("userActivityService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createActivity", () => {
    test("serializes metadata", async () => {
      UserActivity.create.mockResolvedValue({ id: 1 });
      await UserActivityService.createActivity(1, "LOGIN", "ok", { ip: "1.1.1.1" });
      expect(UserActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          Metadata: JSON.stringify({ ip: "1.1.1.1" }),
        })
      );
    });

    test("passes null Metadata khi không có metadata", async () => {
      UserActivity.create.mockResolvedValue({ id: 1 });
      await UserActivityService.createActivity(1, "LOGIN");
      expect(UserActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({ Metadata: null, Description: undefined })
      );
    });

    test("rethrow lỗi khi UserActivity.create fail", async () => {
      UserActivity.create.mockRejectedValue(new Error("db down"));
      await expect(UserActivityService.createActivity(1, "LOGIN")).rejects.toThrow("db down");
    });
  });

  describe("getUserActivities", () => {
    test("parses metadata JSON", async () => {
      UserActivity.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [
          {
            toJSON: () => ({ Metadata: "{\"foo\":1}" }),
          },
        ],
      });
      const out = await UserActivityService.getUserActivities(1);
      expect(out.activities[0].Metadata).toEqual({ foo: 1 });
    });

    test("Metadata JSON hỏng → fallback null thay vì throw", async () => {
      UserActivity.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [{ toJSON: () => ({ Metadata: "{not-json" }) }],
      });
      const out = await UserActivityService.getUserActivities(1);
      expect(out.activities[0].Metadata).toBeNull();
    });

    test("tính pagination.hasMore đúng khi còn dữ liệu", async () => {
      UserActivity.findAndCountAll.mockResolvedValue({ count: 100, rows: [] });
      const out = await UserActivityService.getUserActivities(1, { limit: 20, offset: 0 });
      expect(out.pagination).toEqual({ total: 100, limit: 20, offset: 0, hasMore: true });
    });

    test("hasMore = false khi đã lấy hết", async () => {
      UserActivity.findAndCountAll.mockResolvedValue({ count: 10, rows: [] });
      const out = await UserActivityService.getUserActivities(1, { limit: 20, offset: 0 });
      expect(out.pagination.hasMore).toBe(false);
    });

    test("filter theo activityType và date range được truyền vào where", async () => {
      UserActivity.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
      await UserActivityService.getUserActivities(1, {
        activityType: "login",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      });
      const callArg = UserActivity.findAndCountAll.mock.calls[0][0];
      expect(callArg.where.ActivityType).toBe("login");
      expect(callArg.where.CreatedAt).toBeDefined();
    });

    test("rethrow lỗi khi query fail", async () => {
      UserActivity.findAndCountAll.mockRejectedValue(new Error("query fail"));
      await expect(UserActivityService.getUserActivities(1)).rejects.toThrow("query fail");
    });
  });

  describe("getUserActivityStats", () => {
    test("tổng hợp byType, total, first/last activity date", async () => {
      UserActivity.findAll.mockResolvedValue([
        { ActivityType: "login", count: "3" },
        { ActivityType: "logout", count: "2" },
      ]);
      UserActivity.count.mockResolvedValue(5);
      UserActivity.findOne
        .mockResolvedValueOnce({ CreatedAt: "2026-01-01T00:00:00Z" })
        .mockResolvedValueOnce({ CreatedAt: "2026-06-01T00:00:00Z" });

      const out = await UserActivityService.getUserActivityStats(1);

      expect(out).toEqual({
        total: 5,
        byType: { login: 3, logout: 2 },
        firstActivityDate: "2026-01-01T00:00:00Z",
        lastActivityDate: "2026-06-01T00:00:00Z",
      });
    });

    test("first/last activity date null khi chưa có activity nào", async () => {
      UserActivity.findAll.mockResolvedValue([]);
      UserActivity.count.mockResolvedValue(0);
      UserActivity.findOne.mockResolvedValue(null);

      const out = await UserActivityService.getUserActivityStats(1);

      expect(out.firstActivityDate).toBeNull();
      expect(out.lastActivityDate).toBeNull();
      expect(out.byType).toEqual({});
    });

    test("rethrow lỗi khi query fail", async () => {
      UserActivity.findAll.mockRejectedValue(new Error("stats fail"));
      await expect(UserActivityService.getUserActivityStats(1)).rejects.toThrow("stats fail");
    });
  });

  describe("cleanupOldActivities", () => {
    test("xóa activities cũ hơn daysToKeep và trả về số lượng đã xóa", async () => {
      UserActivity.destroy.mockResolvedValue(7);
      const out = await UserActivityService.cleanupOldActivities(30);
      expect(out).toBe(7);
      expect(UserActivity.destroy).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.any(Object) })
      );
    });

    test("rethrow lỗi khi destroy fail", async () => {
      UserActivity.destroy.mockRejectedValue(new Error("destroy fail"));
      await expect(UserActivityService.cleanupOldActivities()).rejects.toThrow("destroy fail");
    });
  });
});
