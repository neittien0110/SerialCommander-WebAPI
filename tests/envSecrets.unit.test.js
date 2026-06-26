afterEach(() => {
  jest.resetModules();
  delete process.env.JWT_SECRET;
  delete process.env.JWT_SECRET_KEY;
  delete process.env.SESSION_SECRET;
  delete process.env.OTP_CODE_PEPPER;
  process.env.NODE_ENV = "test";
});

function load() {
  jest.resetModules();
  return require("../configs/envSecrets");
}

describe("getJwtSecret", () => {
  test("test env: trả fallback 'test-secret-key' khi không có env", () => {
    process.env.NODE_ENV = "test";
    const { getJwtSecret } = load();
    expect(getJwtSecret()).toBe("test-secret-key");
  });

  test("test env: dùng JWT_SECRET khi có", () => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "my-jwt-secret";
    const { getJwtSecret } = load();
    expect(getJwtSecret()).toBe("my-jwt-secret");
  });

  test("development env: dùng fallback dev khi không có env", () => {
    process.env.NODE_ENV = "development";
    const { getJwtSecret } = load();
    expect(getJwtSecret()).toBe("dev-only-jwt-secret-not-for-production");
  });

  test("development env: dùng JWT_SECRET_KEY (legacy)", () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET_KEY = "legacy-key";
    const { getJwtSecret } = load();
    expect(getJwtSecret()).toBe("legacy-key");
  });
});

describe("getSessionSecret", () => {
  test("test env: trả fallback khi không có SESSION_SECRET", () => {
    process.env.NODE_ENV = "test";
    const { getSessionSecret } = load();
    expect(getSessionSecret()).toBe("test-session-secret-key");
  });

  test("development env: trả fallback dev khi không có env", () => {
    process.env.NODE_ENV = "development";
    const { getSessionSecret } = load();
    expect(getSessionSecret()).toBe("dev-only-session-secret-not-for-production");
  });

  test("test env: dùng SESSION_SECRET khi có", () => {
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "my-session-secret";
    const { getSessionSecret } = load();
    expect(getSessionSecret()).toBe("my-session-secret");
  });
});

describe("getOtpCodePepper", () => {
  test("test env: trả fallback khi không có OTP_CODE_PEPPER", () => {
    process.env.NODE_ENV = "test";
    const { getOtpCodePepper } = load();
    expect(getOtpCodePepper()).toBe("test-otp-pepper-for-jest-ok");
  });

  test("development env: trả fallback dev khi không có env", () => {
    process.env.NODE_ENV = "development";
    const { getOtpCodePepper } = load();
    expect(getOtpCodePepper()).toBe("dev-otp-pepper-not-for-production");
  });
});

describe("production: assertStrongEnough throws khi giá trị yếu", () => {
  test("getJwtSecret production với secret quá ngắn → throw", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "short";
    const { getJwtSecret } = load();
    expect(() => getJwtSecret()).toThrow(/must be set and at least 16 characters/);
    process.env.NODE_ENV = "test";
  });

  test("getSessionSecret production với secret quá ngắn → throw", () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "tiny";
    const { getSessionSecret } = load();
    expect(() => getSessionSecret()).toThrow(/must be set and at least 16 characters/);
    process.env.NODE_ENV = "test";
  });

  test("getOtpCodePepper production với pepper quá ngắn → throw", () => {
    process.env.NODE_ENV = "production";
    process.env.OTP_CODE_PEPPER = "weak";
    const { getOtpCodePepper } = load();
    expect(() => getOtpCodePepper()).toThrow(/must be set and at least 16 characters/);
    process.env.NODE_ENV = "test";
  });

  test("production với secret đủ dài → trả giá trị", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "this-is-a-strong-secret-key-32chars!!";
    const { getJwtSecret } = load();
    expect(getJwtSecret()).toBe("this-is-a-strong-secret-key-32chars!!");
    process.env.NODE_ENV = "test";
  });
});

describe("assertRequiredSecretsLoaded", () => {
  test("gọi tất cả 3 getters mà không throw (test env)", () => {
    process.env.NODE_ENV = "test";
    const { assertRequiredSecretsLoaded } = load();
    expect(() => assertRequiredSecretsLoaded()).not.toThrow();
  });
});
