process.env.NODE_ENV = "test";

jest.mock("bcryptjs", () => ({ hashSync: jest.fn().mockReturnValue("hashed-placeholder") }));
jest.mock("../utils/emailValidation", () => ({
  normalizeEmail: jest.fn().mockImplementation((e) => e.toLowerCase()),
}));
jest.mock("../kernels/logging/appLogger", () => ({ logWarn: jest.fn() }));
jest.mock("../models", () => ({
  User: { findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn() },
}));
jest.mock("../configs/googleOAuth", () => ({
  getGoogleOAuthConfig: jest.fn().mockReturnValue({
    clientID: "test-client-id",
    clientSecret: "test-client-secret",
    callbackURL: "http://localhost/callback",
  }),
}));

let capturedSerialize, capturedDeserialize, capturedGoogleCallback;

jest.mock("passport", () => {
  const serializeUser = jest.fn().mockImplementation((fn) => { capturedSerialize = fn; });
  const deserializeUser = jest.fn().mockImplementation((fn) => { capturedDeserialize = fn; });
  const use = jest.fn();
  return { serializeUser, deserializeUser, use, initialize: jest.fn(), session: jest.fn() };
});
jest.mock("passport-google-oauth20", () => ({
  Strategy: jest.fn().mockImplementation((opts, cb) => {
    capturedGoogleCallback = cb;
    return { _cb: cb };
  }),
}));

const { User } = require("../models");

// Require passport module (side effects happen here)
const passport = require("../configs/passport");

beforeEach(() => jest.clearAllMocks());

describe("passport — serializeUser / deserializeUser", () => {
  test("serializeUser calls done(null, user.id)", () => {
    const done = jest.fn();
    capturedSerialize({ id: 42 }, done);
    expect(done).toHaveBeenCalledWith(null, 42);
  });

  test("deserializeUser calls done(null, user) khi tìm thấy", async () => {
    const done = jest.fn();
    User.findByPk.mockResolvedValue({ id: 5, email: "a@b.com" });
    await capturedDeserialize(5, done);
    expect(done).toHaveBeenCalledWith(null, { id: 5, email: "a@b.com" });
  });

  test("deserializeUser calls done(error) khi throw", async () => {
    const done = jest.fn();
    User.findByPk.mockRejectedValue(new Error("db error"));
    await capturedDeserialize(5, done);
    expect(done).toHaveBeenCalledWith(expect.any(Error), null);
  });
});

describe("passport — GoogleStrategy callback", () => {
  function makeProfile(overrides = {}) {
    return {
      id: "google-id-123",
      emails: [{ value: "user@gmail.com" }],
      ...overrides,
    };
  }

  test("done(error) khi profile không có email", async () => {
    const done = jest.fn();
    await capturedGoogleCallback("tok", "rtok", { id: "gid", emails: [] }, done);
    expect(done).toHaveBeenCalledWith(expect.any(Error), null);
  });

  test("done(null, user) khi googleId đã tồn tại", async () => {
    const done = jest.fn();
    const existingUser = { id: 1, googleId: "google-id-123" };
    User.findOne.mockResolvedValueOnce(existingUser); // by googleId
    await capturedGoogleCallback("tok", "rtok", makeProfile(), done);
    expect(done).toHaveBeenCalledWith(null, existingUser);
  });

  test("done(null, false, {message}) khi email trùng với local user", async () => {
    const done = jest.fn();
    User.findOne
      .mockResolvedValueOnce(null) // by googleId: not found
      .mockResolvedValueOnce({ id: 2, provider: "local" }); // by email: local user
    await capturedGoogleCallback("tok", "rtok", makeProfile(), done);
    expect(done).toHaveBeenCalledWith(null, false, { message: "EMAIL_LINKED_TO_LOCAL" });
  });

  test("cập nhật googleId khi email trùng với google provider user", async () => {
    const done = jest.fn();
    const mockSave = jest.fn().mockResolvedValue(undefined);
    const existingUser = { id: 3, provider: "google", googleId: null, isVerified: false, save: mockSave };
    User.findOne
      .mockResolvedValueOnce(null) // by googleId: not found
      .mockResolvedValueOnce(existingUser); // by email: google user
    await capturedGoogleCallback("tok", "rtok", makeProfile(), done);
    expect(existingUser.googleId).toBe("google-id-123");
    expect(existingUser.isVerified).toBe(true);
    expect(mockSave).toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith(null, existingUser);
  });

  test("tạo user mới khi không tìm thấy googleId hoặc email", async () => {
    const done = jest.fn();
    User.findOne.mockResolvedValue(null); // both queries: not found
    const newUser = { id: 4, googleId: "google-id-123" };
    User.create.mockResolvedValue(newUser);
    await capturedGoogleCallback("tok", "rtok", makeProfile(), done);
    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({ googleId: "google-id-123", provider: "google" })
    );
    expect(newUser._isNewOAuthUser).toBe(true);
    expect(done).toHaveBeenCalledWith(null, newUser);
  });

  test("done(error) khi DB throw", async () => {
    const done = jest.fn();
    User.findOne.mockRejectedValue(new Error("db crash"));
    await capturedGoogleCallback("tok", "rtok", makeProfile(), done);
    expect(done).toHaveBeenCalledWith(expect.any(Error), null);
  });
});

describe("passport — isGoogleOAuthReady / googleOAuthEnabled", () => {
  test("isGoogleOAuthReady trả true khi credentials được cấu hình", () => {
    expect(passport.isGoogleOAuthReady()).toBe(true);
  });

  test("googleOAuthEnabled getter hoạt động như isGoogleOAuthReady", () => {
    expect(passport.googleOAuthEnabled).toBe(true);
  });
});
