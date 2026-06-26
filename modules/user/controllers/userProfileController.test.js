process.env.NODE_ENV = "test";

require("rootpath")();

jest.mock("models", () => ({
  User: {
    findByPk: jest.fn(),
  },
}));
jest.mock("../services/userProfileService", () => ({
  updateUserProfile: jest.fn(),
}));

const { User } = require("models");
const { updateUserProfile } = require("../services/userProfileService");
const controller = require("./userProfileController");

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

describe("userProfileController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getProfile", () => {
    test("trả 200 với thông tin user đã lọc field", async () => {
      User.findByPk.mockResolvedValue({
        id: 1,
        username: "huyen",
        email: "huyen@x.com",
        role: "user",
        provider: "google",
        googleId: "g-1",
        isVerified: true,
      });
      const req = { user: { id: 1 } };
      const res = mockRes();

      await controller.getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.user).toEqual({
        id: 1,
        username: "huyen",
        email: "huyen@x.com",
        role: "user",
        provider: "google",
        isVerified: true,
      });
    });

    test("provider mặc định 'local' khi user không có provider", async () => {
      User.findByPk.mockResolvedValue({
        id: 1,
        username: "huyen",
        email: "huyen@x.com",
        role: "user",
        provider: null,
        isVerified: false,
      });
      const req = { user: { id: 1 } };
      const res = mockRes();

      await controller.getProfile(req, res);

      expect(res.json.mock.calls[0][0].user.provider).toBe("local");
    });

    test("trả 404 khi không tìm thấy user", async () => {
      User.findByPk.mockResolvedValue(null);
      const req = { user: { id: 999 } };
      const res = mockRes();

      await controller.getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    test("trả 500 khi DB lỗi", async () => {
      User.findByPk.mockRejectedValue(new Error("db down"));
      const req = { user: { id: 1 } };
      const res = mockRes();

      await controller.getProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].error.code).toBe("USER_PROFILE_FETCH_FAILED");
    });
  });

  describe("updateProfile", () => {
    test("trả 200 với user đã cập nhật", async () => {
      const user = {
        id: 1,
        username: "new name",
        email: "huyen@x.com",
        role: "user",
        provider: "local",
        isVerified: true,
      };
      updateUserProfile.mockResolvedValue({ user, changed: true });
      const req = { user: { id: 1 }, body: { username: "new name" } };
      const res = mockRes();

      await controller.updateProfile(req, res);

      expect(updateUserProfile).toHaveBeenCalledWith(1, { username: "new name" });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0].user.username).toBe("new name");
    });

    test("trả đúng status/code lấy từ AppError do service throw", async () => {
      const err = new Error("Tên hiển thị đã được sử dụng");
      err.status = 409;
      err.code = "USER_USERNAME_TAKEN";
      updateUserProfile.mockRejectedValue(err);
      const req = { user: { id: 1 }, body: { username: "taken" } };
      const res = mockRes();

      await controller.updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json.mock.calls[0][0].error.code).toBe("USER_USERNAME_TAKEN");
    });

    test("fallback 500 + USER_PROFILE_UPDATE_FAILED khi lỗi không có status/code", async () => {
      updateUserProfile.mockRejectedValue(new Error("unexpected"));
      const req = { user: { id: 1 }, body: { username: "x" } };
      const res = mockRes();

      await controller.updateProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].error.code).toBe("USER_PROFILE_UPDATE_FAILED");
    });

    test("body rỗng (req.body undefined) không làm crash controller", async () => {
      const err = new Error("Tên hiển thị là bắt buộc");
      err.status = 400;
      err.code = "USER_USERNAME_INVALID";
      updateUserProfile.mockRejectedValue(err);
      const req = { user: { id: 1 }, body: undefined };
      const res = mockRes();

      await controller.updateProfile(req, res);

      expect(updateUserProfile).toHaveBeenCalledWith(1, { username: undefined });
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
