const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.resetModules();
});

function fresh() {
  jest.resetModules();
  return require("../configs/googleOAuth");
}

describe("googleOAuth config", () => {
  describe("getGoogleOAuthConfig — callbackURL", () => {
    test("dùng GOOGLE_CALLBACK_URL trực tiếp khi được đặt", () => {
      process.env.GOOGLE_CALLBACK_URL = "  https://app.example.com/auth/google/callback  ";
      const getConfig = fresh();
      expect(getConfig().callbackURL).toBe("https://app.example.com/auth/google/callback");
    });

    test("dùng API_BASE_URL khi GOOGLE_CALLBACK_URL chưa đặt", () => {
      delete process.env.GOOGLE_CALLBACK_URL;
      process.env.API_BASE_URL = "https://api.example.com";
      const getConfig = fresh();
      expect(getConfig().callbackURL).toBe("https://api.example.com/api/auth/google/callback");
    });

    test("cắt trailing slash trong API_BASE_URL", () => {
      delete process.env.GOOGLE_CALLBACK_URL;
      process.env.API_BASE_URL = "https://api.example.com///";
      const getConfig = fresh();
      expect(getConfig().callbackURL).toBe("https://api.example.com/api/auth/google/callback");
    });

    test("fallback localhost:2999 khi không có cả hai env", () => {
      delete process.env.GOOGLE_CALLBACK_URL;
      delete process.env.API_BASE_URL;
      const getConfig = fresh();
      expect(getConfig().callbackURL).toBe("http://localhost:2999/api/auth/google/callback");
    });
  });

  describe("getGoogleOAuthConfig — clientID / clientSecret", () => {
    test("trim clientID và clientSecret từ env", () => {
      process.env.GOOGLE_CLIENT_ID = "  my-client-id  ";
      process.env.GOOGLE_CLIENT_SECRET = "  my-secret  ";
      delete process.env.GOOGLE_CALLBACK_URL;
      const getConfig = fresh();
      const cfg = getConfig();
      expect(cfg.clientID).toBe("my-client-id");
      expect(cfg.clientSecret).toBe("my-secret");
    });

    test("trả chuỗi rỗng khi không đặt clientID/clientSecret", () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      const getConfig = fresh();
      const cfg = getConfig();
      expect(cfg.clientID).toBe("");
      expect(cfg.clientSecret).toBe("");
    });

    test("export named getGoogleOAuthConfig cũng hoạt động", () => {
      const mod = fresh();
      expect(typeof mod.getGoogleOAuthConfig).toBe("function");
      expect(mod.getGoogleOAuthConfig()).toHaveProperty("callbackURL");
    });
  });
});
