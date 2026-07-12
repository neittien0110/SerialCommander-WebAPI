/**
 * Unit Tests - JWT Middleware & CORS
 *
 * Chạy: npm test -- --testPathPattern=middleware.test.js
 */

process.env.NODE_ENV = "test";
// ≥16 ký tự: khi test tạm NODE_ENV=production, getJwtSecret() bắt buộc secret đủ dài
process.env.JWT_SECRET = "test-jwt-secret-for-jest-ok";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.FRONTEND_URLS =
  "http://localhost:5173,https://serial.toolhub.app,https://*.toolhub.app";

require("rootpath")();

const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { verifyToken, verifyAdmin } = require("kernels/middlewares/authMiddleware");
const { isAllowedOrigin } = require("kernels/loaders/securityLoader");

// ─── Setup test app ──────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());

  // Dùng đúng isAllowedOrigin production (như configureSecurity trong securityLoader.js)
  app.use(
    cors({
      origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
      credentials: true,
    })
  );

  // Protected route for testing
  app.get("/protected", verifyToken, (req, res) => {
    res.json({ message: "OK", user: req.user });
  });

  // Admin route for testing
  app.get("/admin", verifyToken, verifyAdmin, (req, res) => {
    res.json({ message: "Admin OK" });
  });

  return app;
}

const app = buildApp();

// ─── JWT MIDDLEWARE TESTS ────────────────────────────────────────────────────

describe("verifyToken middleware", () => {
  test("✅ Cho phép truy cập khi token hợp lệ", async () => {
    const token = jwt.sign(
      { id: 1, username: "testuser", role: "user", type: "access" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 1, username: "testuser" });
  });

  test("✅ Cho phép truy cập khi JWT trong HttpOnly cookie sc_auth_token", async () => {
    const token = jwt.sign(
      { id: 7, username: "cookieuser", role: "user", type: "access" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .get("/protected")
      .set("Cookie", `sc_auth_token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 7, username: "cookieuser" });
  });

  test("✅ Cookie được ưu tiên hơn Bearer khi cả hai có mặt", async () => {
    const cookieToken = jwt.sign(
      { id: 10, username: "from-cookie", role: "user", type: "access" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    const bearerToken = jwt.sign(
      { id: 99, username: "from-bearer", role: "user", type: "access" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .get("/protected")
      .set("Cookie", `sc_auth_token=${encodeURIComponent(cookieToken)}`)
      .set("Authorization", `Bearer ${bearerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 10, username: "from-cookie" });
  });

  test("❌ Từ chối khi không có Authorization header", async () => {
    const res = await request(app).get("/protected");

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Token không được cung cấp/i);
  });

  test("❌ Từ chối khi token sai hoặc giả mạo", async () => {
    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer invalid.token.here");

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Token không hợp lệ/i);
  });

  test("❌ Từ chối khi token đã hết hạn", async () => {
    const expiredToken = jwt.sign(
      { id: 1, username: "testuser", role: "user" },
      process.env.JWT_SECRET,
      { expiresIn: "-1s" } // đã hết hạn
    );

    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Token không hợp lệ/i);
  });

  test("❌ Từ chối khi JWT_SECRET khác nhau (token bị giả)", async () => {
    const fakeToken = jwt.sign(
      { id: 1, username: "hacker", role: "admin" },
      "wrong-secret-key"
    );

    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${fakeToken}`);

    expect(res.status).toBe(401);
  });

  test("❌ Từ chối refresh token dùng làm access token (token-type confusion)", async () => {
    // Refresh token hợp lệ về chữ ký nhưng có type="refresh"
    const refreshToken = jwt.sign(
      { id: 1, tokenId: "abc123", type: "refresh" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const cookieRes = await request(app)
      .get("/protected")
      .set("Cookie", `sc_auth_token=${encodeURIComponent(refreshToken)}`);
    expect(cookieRes.status).toBe(401);

    const bearerRes = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${refreshToken}`);
    expect(bearerRes.status).toBe(401);
  });

  test("❌ Từ chối token không có type (token cũ trước khi patch)", async () => {
    const legacyToken = jwt.sign(
      { id: 1, username: "olduser", role: "user" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${legacyToken}`);
    expect(res.status).toBe(401);
  });

  test("❌ Production: Bearer bị tắt khi không có cookie", async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevBearer = process.env.ALLOW_BEARER_AUTH;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.ALLOW_BEARER_AUTH;

      const token = jwt.sign(
        { id: 2, username: "bearer-only", role: "user", type: "access" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      const res = await request(app)
        .get("/protected")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe("BEARER_AUTH_DISABLED");
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevBearer !== undefined) process.env.ALLOW_BEARER_AUTH = prevBearer;
      else delete process.env.ALLOW_BEARER_AUTH;
    }
  });

  test("✅ Production: HttpOnly cookie vẫn hoạt động khi Bearer tắt", async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevBearer = process.env.ALLOW_BEARER_AUTH;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.ALLOW_BEARER_AUTH;

      const token = jwt.sign(
        { id: 3, username: "cookie-prod", role: "user", type: "access" },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      const res = await request(app)
        .get("/protected")
        .set("Cookie", `sc_auth_token=${encodeURIComponent(token)}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ id: 3, username: "cookie-prod" });
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevBearer !== undefined) process.env.ALLOW_BEARER_AUTH = prevBearer;
      else delete process.env.ALLOW_BEARER_AUTH;
    }
  });
});

// ─── ADMIN MIDDLEWARE TESTS ──────────────────────────────────────────────────

describe("verifyAdmin middleware", () => {
  test("✅ Admin có thể truy cập admin route", async () => {
    const token = jwt.sign(
      { id: 1, username: "adminuser", role: "admin", type: "access" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .get("/admin")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Admin OK");
  });

  test("❌ User thường bị từ chối truy cập admin route", async () => {
    const token = jwt.sign(
      { id: 2, username: "regularuser", role: "user", type: "access" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .get("/admin")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/admin/i);
  });
});

// ─── CORS TESTS ──────────────────────────────────────────────────────────────

describe("CORS configuration", () => {
  test("✅ Cho phép origin hợp lệ trong whitelist", async () => {
    const res = await request(app)
      .get("/protected")
      .set("Origin", "http://localhost:5173")
      .set("Authorization", "Bearer invalid"); // sẽ fail 401 nhưng CORS OK

    // CORS header phải tồn tại
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173"
    );
  });

  test("✅ Cho phép production origin hợp lệ", async () => {
    const res = await request(app)
      .get("/protected")
      .set("Origin", "https://serial.toolhub.app")
      .set("Authorization", "Bearer invalid");

    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://serial.toolhub.app"
    );
  });

  test("✅ Cho phép localhost bất kỳ port (non-production)", async () => {
    // NODE_ENV=test, không phải production → localhost:XXXX được cho phép
    const res = await request(app)
      .get("/protected")
      .set("Origin", "http://localhost:3000")
      .set("Authorization", "Bearer invalid");

    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000"
    );
  });

  test("✅ Cho phép LAN IP khi dev (vite --host 0.0.0.0)", async () => {
    const res = await request(app)
      .get("/protected")
      .set("Origin", "http://192.168.5.175:5173")
      .set("Authorization", "Bearer invalid");

    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://192.168.5.175:5173"
    );
  });

  test("✅ Cho phép subdomain toolhub.app qua wildcard (serial2)", async () => {
    const res = await request(app)
      .get("/protected")
      .set("Origin", "https://serial2.toolhub.app")
      .set("Authorization", "Bearer invalid");

    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://serial2.toolhub.app"
    );
  });

  test("❌ Wildcard không khớp domain giả mạo dạng x.toolhub.app.evil.com", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const res = await request(buildApp())
      .get("/protected")
      .set("Origin", "https://serial2.toolhub.app.evil.com")
      .set("Authorization", "Bearer invalid");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });

  test("❌ Chặn origin không được phép trong production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const prodApp = buildApp(); // rebuild với NODE_ENV=production
    const res = await request(prodApp)
      .get("/protected")
      .set("Origin", "https://evil-site.com")
      .set("Authorization", "Bearer invalid");

    // CORS error → không có allow-origin header hoặc response lỗi
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });

  test("✅ Cho phép request không có Origin (server-to-server, Postman)", async () => {
    const token = jwt.sign(
      { id: 1, username: "testuser", role: "user", type: "access" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);
    // Không set Origin header → coi như server-to-server

    expect(res.status).toBe(200);
  });
});

// ─── JWT TOKEN STRUCTURE TESTS ───────────────────────────────────────────────

describe("JWT token structure", () => {
  test("✅ Token chứa đủ các field cần thiết (id, username, role, type)", () => {
    const token = jwt.sign(
      { id: 5, username: "user5", role: "user", type: "access" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    expect(decoded).toHaveProperty("id", 5);
    expect(decoded).toHaveProperty("username", "user5");
    expect(decoded).toHaveProperty("role", "user");
    expect(decoded).toHaveProperty("type", "access");
    expect(decoded).toHaveProperty("exp"); // expiry tồn tại
    expect(decoded).toHaveProperty("iat"); // issued-at tồn tại
  });

  test("✅ Token hết hạn sau 1 ngày", () => {
    const token = jwt.sign(
      { id: 1, username: "test", role: "user", type: "access" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    const decoded = jwt.decode(token);
    const oneDayInSeconds = 24 * 60 * 60;
    const diff = decoded.exp - decoded.iat;

    // Cho phép sai số nhỏ
    expect(diff).toBeCloseTo(oneDayInSeconds, -1);
  });
});
