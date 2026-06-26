process.env.NODE_ENV = "test";

require("rootpath")();

jest.mock("models", () => ({
  User: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
  },
}));
jest.mock("./userActivityService", () => ({
  createActivity: jest.fn(),
}));

const { User } = require("models");
const UserActivityService = require("./userActivityService");
const { updateUserProfile } = require("./userProfileService");

describe("userProfileService.updateUserProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("throw 401 khi không có userId", async () => {
    await expect(updateUserProfile(null, { username: "abc" })).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(User.findByPk).not.toHaveBeenCalled();
  });

  test("throw 400 khi username không hợp lệ", async () => {
    await expect(updateUserProfile(1, { username: "a" })).rejects.toMatchObject({
      status: 400,
      code: "USER_USERNAME_INVALID",
    });
    expect(User.findByPk).not.toHaveBeenCalled();
  });

  test("throw 404 khi không tìm thấy user", async () => {
    User.findByPk.mockResolvedValue(null);
    await expect(updateUserProfile(1, { username: "valid name" })).rejects.toMatchObject({
      status: 404,
      code: "USER_NOT_FOUND",
    });
  });

  test("throw 409 khi username đã bị người khác lấy", async () => {
    User.findByPk.mockResolvedValue({ id: 1, username: "old" });
    User.findOne.mockResolvedValue({ id: 2 });

    await expect(updateUserProfile(1, { username: "taken name" })).rejects.toMatchObject({
      status: 409,
      code: "USER_USERNAME_TAKEN",
    });
  });

  test("không throw khi username 'đã lấy' chính là user hiện tại", async () => {
    const user = { id: 1, username: "old", update: jest.fn() };
    User.findByPk.mockResolvedValue(user);
    User.findOne.mockResolvedValue({ id: 1 });

    const out = await updateUserProfile(1, { username: "old" });
    // username không đổi (normalize("old") === "old") → changed: false, không update/log.
    expect(out).toEqual({ user, changed: false });
    expect(user.update).not.toHaveBeenCalled();
  });

  test("changed: false và không gọi update/log khi username giữ nguyên", async () => {
    const user = { id: 1, username: "same name", update: jest.fn() };
    User.findByPk.mockResolvedValue(user);
    User.findOne.mockResolvedValue(null);

    const out = await updateUserProfile(1, { username: "same name" });

    expect(out).toEqual({ user, changed: false });
    expect(user.update).not.toHaveBeenCalled();
    expect(UserActivityService.createActivity).not.toHaveBeenCalled();
  });

  test("đổi tên thành công → update + log activity profile_updated", async () => {
    const user = { id: 1, username: "old name", update: jest.fn().mockResolvedValue() };
    User.findByPk.mockResolvedValue(user);
    User.findOne.mockResolvedValue(null);
    UserActivityService.createActivity.mockResolvedValue({});

    const out = await updateUserProfile(1, { username: "new name" });

    expect(user.update).toHaveBeenCalledWith({ username: "new name" });
    expect(UserActivityService.createActivity).toHaveBeenCalledWith(
      1,
      "profile_updated",
      null,
      { previousUsername: "old name", newUsername: "new name" }
    );
    expect(out).toEqual({ user, changed: true });
  });

  test("lỗi log activity bị nuốt (swallow) — vẫn trả về changed: true", async () => {
    const user = { id: 1, username: "old name", update: jest.fn().mockResolvedValue() };
    User.findByPk.mockResolvedValue(user);
    User.findOne.mockResolvedValue(null);
    UserActivityService.createActivity.mockRejectedValue(new Error("log down"));

    const out = await expect(updateUserProfile(1, { username: "new name" })).resolves.toEqual({
      user,
      changed: true,
    });
    return out;
  });
});
