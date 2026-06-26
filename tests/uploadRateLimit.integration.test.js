process.env.NODE_ENV = "test";
process.env.RATE_LIMIT_IN_TEST = "1";
process.env.UPLOAD_RL_PER_MIN = "2";

require("rootpath")();

const express = require("express");
const request = require("supertest");

jest.mock("kernels/redis/redisClientFactory", () => ({
  createRedisClient: jest.fn().mockReturnValue({ client: null, mode: "none" }),
}));

jest.mock("kernels/middlewares/authMiddleware", () => ({
  verifyToken: (req, _res, next) => {
    req.user = { id: req.headers["x-test-user"] || 7 };
    next();
  },
}));

jest.mock("kernels/middlewares/uploadMiddleware", () => ({
  single: () => (req, _res, next) => {
    req.file = {
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      originalname: "a.jpg",
      mimetype: "image/jpeg",
    };
    next();
  },
}));

jest.mock("modules/upload/services/objectUploadService", () => ({
  saveImage: jest.fn().mockResolvedValue({
    url: "https://example.com/a.jpg",
    key: "7/a.jpg",
    provider: "stub",
  }),
}));

const { _resetRateLimitStateForTests } = require("kernels/middlewares/simpleRateLimit");

describe("POST /api/upload — rate limit", () => {
  beforeEach(() => {
    _resetRateLimitStateForTests();
  });

  test("vượt UPLOAD_RL_PER_MIN (=2) trong cùng phút → request thứ 3 trả 429", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/upload", require("routes/uploadRoutes"));

    const res1 = await request(app).post("/api/upload").attach("image", Buffer.from("x"), "a.jpg");
    expect(res1.status).toBe(200);

    const res2 = await request(app).post("/api/upload").attach("image", Buffer.from("x"), "a.jpg");
    expect(res2.status).toBe(200);

    const res3 = await request(app).post("/api/upload").attach("image", Buffer.from("x"), "a.jpg");
    expect(res3.status).toBe(429);
    expect(res3.body).toHaveProperty("error.code", "RATE_LIMIT_EXCEEDED");
  });

  test("rate limit theo user — 2 user khác nhau không ảnh hưởng nhau", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/upload", require("routes/uploadRoutes"));

    await request(app)
      .post("/api/upload")
      .set("x-test-user", "100")
      .attach("image", Buffer.from("x"), "a.jpg");
    await request(app)
      .post("/api/upload")
      .set("x-test-user", "100")
      .attach("image", Buffer.from("x"), "a.jpg");

    // user 100 đã chạm ngưỡng 2 — request thứ 3 của user 100 bị block
    const blocked = await request(app)
      .post("/api/upload")
      .set("x-test-user", "100")
      .attach("image", Buffer.from("x"), "a.jpg");
    expect(blocked.status).toBe(429);

    // user 200 chưa upload lần nào — vẫn được phép
    const otherUser = await request(app)
      .post("/api/upload")
      .set("x-test-user", "200")
      .attach("image", Buffer.from("x"), "a.jpg");
    expect(otherUser.status).toBe(200);
  });
});
