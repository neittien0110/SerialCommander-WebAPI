jest.mock("bcryptjs", () => ({ hash: jest.fn().mockResolvedValue("hashed-pw") }));
jest.mock("../../../models", () => ({
  User: { findOne: jest.fn(), create: jest.fn() },
  PendingRegistration: { findOne: jest.fn(), create: jest.fn() },
  EmailVerificationCode: { destroy: jest.fn().mockResolvedValue(0) },
  PasswordReset: { destroy: jest.fn().mockResolvedValue(0) },
}));
jest.mock("./authDomainService", () => ({
  hashOneTimeCode: jest.fn().mockImplementation((c) => `hashed:${c}`),
  createExpiryDate: jest.fn().mockReturnValue(new Date(Date.now() + 3600 * 1000)),
}));
jest.mock("../../../utils/emailValidation", () => ({
  normalizeEmail: jest.fn().mockImplementation((e) => (e ? e.toLowerCase().trim() : null)),
}));
jest.mock("../../../utils/usernameValidation", () => ({
  validateUsername: jest.fn(),
}));

const { User, PendingRegistration, EmailVerificationCode, PasswordReset } = require("../../../models");
const { hashOneTimeCode } = require("./authDomainService");
const { normalizeEmail } = require("../../../utils/emailValidation");
const { validateUsername } = require("../../../utils/usernameValidation");
const {
  removeLegacyUnverifiedLocalUser,
  upsertPendingRegistration,
  findPendingByEmail,
  findPendingByEmailAndCode,
  refreshPendingVerificationCode,
  resolveRegistrationUsername,
  activatePendingRegistration,
} = require("./pendingRegistrationService");

beforeEach(() => jest.clearAllMocks());

// ─── removeLegacyUnverifiedLocalUser ─────────────────────────────────────────
describe("removeLegacyUnverifiedLocalUser", () => {
  test("no-op khi normalizeEmail trả null", async () => {
    normalizeEmail.mockReturnValueOnce(null);
    await removeLegacyUnverifiedLocalUser("bad@");
    expect(User.findOne).not.toHaveBeenCalled();
  });

  test("no-op khi không tìm thấy user", async () => {
    User.findOne.mockResolvedValueOnce(null);
    await removeLegacyUnverifiedLocalUser("a@b.com");
    expect(EmailVerificationCode.destroy).not.toHaveBeenCalled();
  });

  test("xóa codes và user khi tìm thấy", async () => {
    const mockDestroy = jest.fn().mockResolvedValue(undefined);
    User.findOne.mockResolvedValueOnce({ id: 1, destroy: mockDestroy });
    await removeLegacyUnverifiedLocalUser("a@b.com");
    expect(EmailVerificationCode.destroy).toHaveBeenCalled();
    expect(PasswordReset.destroy).toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalled();
  });
});

// ─── upsertPendingRegistration ────────────────────────────────────────────────
describe("upsertPendingRegistration", () => {
  test("update khi đã có pending row", async () => {
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    const existing = { update: mockUpdate };
    PendingRegistration.findOne.mockResolvedValueOnce(existing);

    const result = await upsertPendingRegistration("a@b.com", "pw123", "code");
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ password: "hashed-pw" }));
    expect(result).toBe(existing);
  });

  test("create khi chưa có pending row", async () => {
    PendingRegistration.findOne.mockResolvedValueOnce(null);
    const newRow = { id: 1 };
    PendingRegistration.create.mockResolvedValueOnce(newRow);

    const result = await upsertPendingRegistration("a@b.com", "pw123", "code");
    expect(PendingRegistration.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "a@b.com", password: "hashed-pw" })
    );
    expect(result).toBe(newRow);
  });
});

// ─── findPendingByEmail ───────────────────────────────────────────────────────
describe("findPendingByEmail", () => {
  test("trả null khi không tìm thấy", async () => {
    PendingRegistration.findOne.mockResolvedValueOnce(null);
    expect(await findPendingByEmail("x@y.com")).toBeNull();
  });

  test("trả row khi tìm thấy và chưa expire", async () => {
    const row = { expiresAt: new Date(Date.now() + 3600 * 1000) };
    PendingRegistration.findOne.mockResolvedValueOnce(row);
    expect(await findPendingByEmail("x@y.com")).toBe(row);
  });

  test("xóa và trả null khi row đã expire", async () => {
    const mockDestroy = jest.fn().mockResolvedValue(undefined);
    const row = { expiresAt: new Date(Date.now() - 1000), destroy: mockDestroy };
    PendingRegistration.findOne.mockResolvedValueOnce(row);
    expect(await findPendingByEmail("x@y.com")).toBeNull();
    expect(mockDestroy).toHaveBeenCalled();
  });
});

// ─── findPendingByEmailAndCode ────────────────────────────────────────────────
describe("findPendingByEmailAndCode", () => {
  test("trả null khi không tìm thấy pending", async () => {
    PendingRegistration.findOne.mockResolvedValueOnce(null);
    expect(await findPendingByEmailAndCode("x@y.com", "code")).toBeNull();
  });

  test("trả null khi code không khớp", async () => {
    const row = { expiresAt: new Date(Date.now() + 3600000), verifyCode: "hashed:right" };
    PendingRegistration.findOne.mockResolvedValueOnce(row);
    hashOneTimeCode.mockReturnValueOnce("hashed:wrong");
    expect(await findPendingByEmailAndCode("x@y.com", "wrong")).toBeNull();
  });

  test("trả row khi code khớp hash", async () => {
    const row = { expiresAt: new Date(Date.now() + 3600000), verifyCode: "hashed:mycode" };
    PendingRegistration.findOne.mockResolvedValueOnce(row);
    hashOneTimeCode.mockReturnValueOnce("hashed:mycode");
    expect(await findPendingByEmailAndCode("x@y.com", "mycode")).toBe(row);
  });
});

// ─── refreshPendingVerificationCode ──────────────────────────────────────────
describe("refreshPendingVerificationCode", () => {
  test("trả null khi không tìm thấy row", async () => {
    PendingRegistration.findOne.mockResolvedValueOnce(null);
    expect(await refreshPendingVerificationCode("x@y.com", "code")).toBeNull();
  });

  test("update và trả row khi tìm thấy", async () => {
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    const row = { update: mockUpdate };
    PendingRegistration.findOne.mockResolvedValueOnce(row);
    const result = await refreshPendingVerificationCode("x@y.com", "newcode");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ verifyCode: "hashed:newcode" })
    );
    expect(result).toBe(row);
  });
});

// ─── resolveRegistrationUsername ─────────────────────────────────────────────
describe("resolveRegistrationUsername", () => {
  test("throw 400 khi preferred username không hợp lệ", async () => {
    validateUsername.mockReturnValueOnce({ ok: false, message: "too short" });
    await expect(resolveRegistrationUsername("a@b.com", "x")).rejects.toMatchObject({
      status: 400, code: "AUTH_USERNAME_INVALID",
    });
  });

  test("throw 409 khi preferred username đã tồn tại", async () => {
    validateUsername.mockReturnValueOnce({ ok: true, value: "alice" });
    User.findOne.mockResolvedValueOnce({ id: 99 });
    await expect(resolveRegistrationUsername("a@b.com", "alice")).rejects.toMatchObject({
      status: 409, code: "AUTH_USERNAME_TAKEN",
    });
  });

  test("trả value khi preferred username hợp lệ và chưa tồn tại", async () => {
    validateUsername.mockReturnValueOnce({ ok: true, value: "alice" });
    User.findOne.mockResolvedValueOnce(null);
    expect(await resolveRegistrationUsername("a@b.com", "alice")).toBe("alice");
  });

  test("auto-generate từ email khi không có preferredUsername", async () => {
    User.findOne.mockResolvedValueOnce(null); // không conflict
    const username = await resolveRegistrationUsername("alice@example.com", null);
    expect(username).toBe("alice");
  });

  test("thêm suffix khi username đầu tiên bị trùng", async () => {
    // lần 1: "alice" bị trùng, lần 2: "alice1" ok
    User.findOne
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce(null);
    const username = await resolveRegistrationUsername("alice@example.com", null);
    expect(username).toBe("alice1");
  });
});

// ─── activatePendingRegistration ─────────────────────────────────────────────
describe("activatePendingRegistration", () => {
  test("trả user hiện tại nếu email đã verified (không tạo lại)", async () => {
    const existing = { id: 5, email: "a@b.com" };
    const mockDestroyPending = jest.fn().mockResolvedValue(undefined);
    const pending = { email: "a@b.com", password: "hashed-pw", destroy: mockDestroyPending };
    User.findOne.mockResolvedValueOnce(existing); // verified user
    const result = await activatePendingRegistration(pending, null);
    expect(result).toBe(existing);
    expect(mockDestroyPending).toHaveBeenCalled();
  });

  test("tạo user mới khi chưa có verified user", async () => {
    const mockDestroyPending = jest.fn().mockResolvedValue(undefined);
    const pending = { email: "new@b.com", password: "hashed-pw", destroy: mockDestroyPending };
    User.findOne
      .mockResolvedValueOnce(null) // no verified user
      .mockResolvedValueOnce(null) // removeLegacyUnverifiedLocalUser: no unverified user
      .mockResolvedValueOnce(null); // pickUniqueUsername: no conflict

    const newUser = { id: 10, email: "new@b.com" };
    User.create.mockResolvedValueOnce(newUser);

    const result = await activatePendingRegistration(pending, null);
    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "new@b.com", isVerified: true })
    );
    expect(result).toBe(newUser);
    expect(mockDestroyPending).toHaveBeenCalled();
  });
});
