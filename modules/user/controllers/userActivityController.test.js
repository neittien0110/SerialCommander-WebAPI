process.env.NODE_ENV = "test";

require("rootpath")();

jest.mock("../services/userActivityService");

const UserActivityService = require("../services/userActivityService");
const controller = require("./userActivityController");

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

describe("userActivityController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getUserActivities", () => {
    test("trả 200 với kết quả từ service, truyền đúng query params", async () => {
      const result = { activities: [], pagination: { total: 0 } };
      UserActivityService.getUserActivities.mockResolvedValue(result);
      const req = {
        user: { id: 42 },
        query: { limit: "10", offset: "5", activityType: "login" },
      };
      const res = mockRes();

      await controller.getUserActivities(req, res);

      expect(UserActivityService.getUserActivities).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ limit: "10", offset: "5", activityType: "login" })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining(result));
    });

    test("trả 500 khi service throw", async () => {
      UserActivityService.getUserActivities.mockRejectedValue(new Error("boom"));
      const req = { user: { id: 1 }, query: {} };
      const res = mockRes();

      await controller.getUserActivities(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];
      expect(payload.error.code).toBe("USER_ACTIVITY_FETCH_FAILED");
    });
  });

  describe("getUserActivityStats", () => {
    test("trả 200 với stats từ service", async () => {
      const stats = { total: 3, byType: {} };
      UserActivityService.getUserActivityStats.mockResolvedValue(stats);
      const req = { user: { id: 7 }, query: {} };
      const res = mockRes();

      await controller.getUserActivityStats(req, res);

      expect(UserActivityService.getUserActivityStats).toHaveBeenCalledWith(7, null, null);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ stats }));
    });

    test("trả 500 khi service throw", async () => {
      UserActivityService.getUserActivityStats.mockRejectedValue(new Error("boom"));
      const req = { user: { id: 1 }, query: {} };
      const res = mockRes();

      await controller.getUserActivityStats(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];
      expect(payload.error.code).toBe("USER_ACTIVITY_STATS_FAILED");
    });
  });

  describe("createActivity", () => {
    test("trả 400 khi thiếu activityType", async () => {
      const req = { user: { id: 1 }, body: {}, ip: "1.2.3.4", connection: {}, get: () => "" };
      const res = mockRes();

      await controller.createActivity(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(UserActivityService.createActivity).not.toHaveBeenCalled();
    });

    test("trả 201 với activity tạo thành công", async () => {
      const activity = { Id: "abc" };
      UserActivityService.createActivity.mockResolvedValue(activity);
      const req = {
        user: { id: 1 },
        body: { activityType: "login", description: "ok", metadata: { x: 1 } },
        ip: "1.2.3.4",
        connection: {},
        get: () => "ua-string",
      };
      const res = mockRes();

      await controller.createActivity(req, res);

      expect(UserActivityService.createActivity).toHaveBeenCalledWith(
        1,
        "login",
        "ok",
        { x: 1 },
        "1.2.3.4",
        "ua-string"
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ activity }));
    });

    test("trả 500 khi service throw", async () => {
      UserActivityService.createActivity.mockRejectedValue(new Error("boom"));
      const req = {
        user: { id: 1 },
        body: { activityType: "login" },
        ip: "1.2.3.4",
        connection: {},
        get: () => "",
      };
      const res = mockRes();

      await controller.createActivity(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];
      expect(payload.error.code).toBe("USER_ACTIVITY_CREATE_FAILED");
    });
  });
});
