/**
 * Unit Tests - CSRF Origin guard
 *
 * Chạy: npm test -- --testPathPattern=csrf.test.js
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-for-jest-ok";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.FRONTEND_URLS = "http://localhost:5173,https://serial.toolhub.app";

require("rootpath")();

const request = require("supertest");
const express = require("express");
const { csrfProtection } = require("kernels/middlewares/csrfMiddleware");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(csrfProtection);

  app.get("/scenarios", (_req, res) => res.json({ ok: true }));
  app.post("/scenarios", (_req, res) => res.json({ created: true }));
  app.delete("/scenarios/:id", (_req, res) => res.json({ deleted: true }));

  return app;
}

const app = buildApp();
const AUTH_COOKIE = "sc_auth_token=abc.def.ghi";

describe("csrfProtection middleware", () => {
  test("✅ Bỏ qua request GET (safe method) kể cả Origin lạ", async () => {
    const res = await request(app)
      .get("/scenarios")
      .set("Cookie", AUTH_COOKIE)
      .set("Origin", "https://evil.example.com");
    expect(res.status).toBe(200);
  });

  test("✅ Cho phép POST khi Origin thuộc allowlist + có cookie auth", async () => {
    const res = await request(app)
      .post("/scenarios")
      .set("Cookie", AUTH_COOKIE)
      .set("Origin", "https://serial.toolhub.app");
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(true);
  });

  test("❌ Chặn POST từ Origin lạ khi mang cookie auth", async () => {
    const res = await request(app)
      .post("/scenarios")
      .set("Cookie", AUTH_COOKIE)
      .set("Origin", "https://evil.example.com");
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("CSRF_ORIGIN_REJECTED");
  });

  test("❌ Chặn DELETE từ Origin lạ (endpoint thay đổi trạng thái)", async () => {
    const res = await request(app)
      .delete("/scenarios/1")
      .set("Cookie", AUTH_COOKIE)
      .set("Origin", "https://evil.example.com");
    expect(res.status).toBe(403);
  });

  test("✅ Bỏ qua khi không có cookie auth (không phải vector CSRF)", async () => {
    const res = await request(app)
      .post("/scenarios")
      .set("Origin", "https://evil.example.com");
    expect(res.status).toBe(200);
  });

  test("✅ Bỏ qua khi xác thực bằng Bearer (không có cookie)", async () => {
    const res = await request(app)
      .post("/scenarios")
      .set("Authorization", "Bearer some.jwt.token")
      .set("Origin", "https://evil.example.com");
    expect(res.status).toBe(200);
  });

  test("✅ Cho phép khi không có Origin lẫn Referer (server-to-server)", async () => {
    const res = await request(app).post("/scenarios").set("Cookie", AUTH_COOKIE);
    expect(res.status).toBe(200);
  });

  test("✅ Dùng Referer khi thiếu Origin — allowlist hợp lệ", async () => {
    const res = await request(app)
      .post("/scenarios")
      .set("Cookie", AUTH_COOKIE)
      .set("Referer", "https://serial.toolhub.app/scenarios/new");
    expect(res.status).toBe(200);
  });

  test("❌ Chặn theo Referer lạ khi thiếu Origin", async () => {
    const res = await request(app)
      .post("/scenarios")
      .set("Cookie", AUTH_COOKIE)
      .set("Referer", "https://evil.example.com/attack.html");
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("CSRF_ORIGIN_REJECTED");
  });
});
