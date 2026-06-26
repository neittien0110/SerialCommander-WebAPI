jest.mock("../../../models", () => ({ User: { findOne: jest.fn() } }));
jest.mock("../../../utils/emailService", () => ({ sendEmailVerificationCodeEmail: jest.fn() }));
jest.mock("./authDomainService", () => ({ createOtpCode: jest.fn().mockReturnValue("123456") }));
jest.mock("./pendingRegistrationService", () => ({
  removeLegacyUnverifiedLocalUser: jest.fn().mockResolvedValue(undefined),
  upsertPendingRegistration: jest.fn().mockResolvedValue({}),
  resolveRegistrationUsername: jest.fn().mockResolvedValue("alice"),
}));
jest.mock("../../../utils/emailValidation", () => ({
  assertValidEmail: jest.fn().mockImplementation((e) => e.toLowerCase().trim()),
  validatePassword: jest.fn().mockReturnValue({ ok: true }),
}));

const { User } = require("../../../models");
const { sendEmailVerificationCodeEmail } = require("../../../utils/emailService");
const { assertValidEmail, validatePassword } = require("../../../utils/emailValidation");
const { removeLegacyUnverifiedLocalUser, upsertPendingRegistration, resolveRegistrationUsername } = require("./pendingRegistrationService");
const { registerLocalUser, mapRegisterError } = require("./authRegisterService");

beforeEach(() => jest.clearAllMocks());

// ─── registerLocalUser ────────────────────────────────────────────────────────
describe("registerLocalUser", () => {
  test("400 AUTH_PASSWORD_WEAK khi password không hợp lệ", async () => {
    validatePassword.mockReturnValueOnce({ ok: false, message: "too short" });
    await expect(registerLocalUser({ email: "a@b.com", password: "x", username: null }))
      .rejects.toMatchObject({ status: 400, code: "AUTH_PASSWORD_WEAK" });
  });

  test("400 AUTH_EMAIL_EXISTS khi email đã verified", async () => {
    User.findOne.mockResolvedValueOnce({ provider: "local", isVerified: true });
    await expect(registerLocalUser({ email: "a@b.com", password: "pw", username: null }))
      .rejects.toMatchObject({ status: 400, code: "AUTH_EMAIL_EXISTS" });
  });

  test("xóa legacy unverified user nếu tồn tại chưa verify", async () => {
    User.findOne.mockResolvedValueOnce({ provider: "local", isVerified: false });
    sendEmailVerificationCodeEmail.mockResolvedValue({ devLogged: false });
    await registerLocalUser({ email: "a@b.com", password: "pw", username: null });
    expect(removeLegacyUnverifiedLocalUser).toHaveBeenCalled();
  });

  test("kiểm tra username nếu được cung cấp", async () => {
    User.findOne.mockResolvedValueOnce(null);
    sendEmailVerificationCodeEmail.mockResolvedValue({ devLogged: false });
    await registerLocalUser({ email: "a@b.com", password: "pw", username: "alice" });
    expect(resolveRegistrationUsername).toHaveBeenCalledWith("a@b.com", "alice");
  });

  test("trả {email, emailSent: true} khi gửi email thành công", async () => {
    User.findOne.mockResolvedValueOnce(null);
    sendEmailVerificationCodeEmail.mockResolvedValue({ devLogged: false });
    const result = await registerLocalUser({ email: "a@b.com", password: "pw", username: null });
    expect(result.email).toBe("a@b.com");
    expect(result.emailSent).toBe(true);
    expect(result.devOtp).toBeUndefined();
  });

  test("emailSent=false khi email service throw", async () => {
    User.findOne.mockResolvedValueOnce(null);
    sendEmailVerificationCodeEmail.mockRejectedValue(new Error("SMTP error"));
    const result = await registerLocalUser({ email: "a@b.com", password: "pw", username: null });
    expect(result.emailSent).toBe(false);
  });

  test("devOtp=code khi devLogged=true và NODE_ENV!=production", async () => {
    process.env.NODE_ENV = "test";
    User.findOne.mockResolvedValueOnce(null);
    sendEmailVerificationCodeEmail.mockResolvedValue({ devLogged: true });
    const result = await registerLocalUser({ email: "a@b.com", password: "pw", username: null });
    expect(result.emailSent).toBe(false);
    expect(result.devOtp).toBe("123456");
  });
});

// ─── mapRegisterError ─────────────────────────────────────────────────────────
describe("mapRegisterError", () => {
  test("passthrough error khi có status+code", () => {
    const err = new Error("custom");
    err.status = 409;
    err.code = "MY_CODE";
    expect(mapRegisterError(err)).toEqual({ status: 409, code: "MY_CODE", message: "custom" });
  });

  test("500 AUTH_CONFIG khi message berisi OTP_CODE_PEPPER", () => {
    expect(mapRegisterError(new Error("OTP_CODE_PEPPER not set")))
      .toMatchObject({ status: 500, code: "AUTH_CONFIG" });
  });

  test("500 DB_SCHEMA khi sqlMessage berisi 'Unknown column'", () => {
    const err = new Error("db error");
    err.parent = { sqlMessage: "Unknown column 'x' in field list" };
    expect(mapRegisterError(err)).toMatchObject({ status: 500, code: "DB_SCHEMA" });
  });

  test("500 DB_SCHEMA khi sqlMessage berisi 'doesn't exist'", () => {
    const err = new Error("db error");
    err.parent = { sqlMessage: "Table 'x' doesn't exist" };
    expect(mapRegisterError(err)).toMatchObject({ status: 500, code: "DB_SCHEMA" });
  });

  test("400 AUTH_EMAIL_EXISTS khi SequelizeUniqueConstraintError+fields.email", () => {
    const err = new Error("dup");
    err.name = "SequelizeUniqueConstraintError";
    err.fields = { email: "a@b.com" };
    expect(mapRegisterError(err)).toMatchObject({ status: 400, code: "AUTH_EMAIL_EXISTS" });
  });

  test("400 AUTH_DUPLICATE khi SequelizeUniqueConstraintError tổng quát", () => {
    const err = new Error("dup");
    err.name = "SequelizeUniqueConstraintError";
    err.fields = { username: "alice" };
    expect(mapRegisterError(err)).toMatchObject({ status: 400, code: "AUTH_DUPLICATE" });
  });

  test("400 AUTH_INVALID_EMAIL khi SequelizeValidationError cho email", () => {
    const err = new Error("validation");
    err.name = "SequelizeValidationError";
    err.errors = [{ path: "email", message: "email invalid" }];
    expect(mapRegisterError(err)).toMatchObject({ status: 400, code: "AUTH_INVALID_EMAIL" });
  });

  test("400 AUTH_VALIDATION khi SequelizeValidationError cho field khác", () => {
    const err = new Error("validation");
    err.name = "SequelizeValidationError";
    err.errors = [{ path: "username", message: "too short" }];
    expect(mapRegisterError(err)).toMatchObject({ status: 400, code: "AUTH_VALIDATION" });
  });

  test("500 AUTH_REGISTER_FAILED cho lỗi không xác định", () => {
    expect(mapRegisterError(new Error("unknown"))).toMatchObject({ status: 500, code: "AUTH_REGISTER_FAILED" });
  });
});
