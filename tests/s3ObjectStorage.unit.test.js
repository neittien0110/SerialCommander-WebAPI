process.env.NODE_ENV = "test";

const fs = require("fs");
const path = require("path");

const ORIGINAL_ENV = { ...process.env };

function setEnv(overrides) {
  process.env = { ...ORIGINAL_ENV, ...overrides };
}

describe("s3ObjectStorage", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
    jest.dontMock("@aws-sdk/client-s3");
  });

  describe("saveObject — bucket chưa cấu hình", () => {
    test("throw 503 UPLOAD_S3_NOT_CONFIGURED khi thiếu UPLOAD_S3_BUCKET", async () => {
      setEnv({ UPLOAD_S3_BUCKET: "" });
      const { saveObject } = require("../kernels/storage/drivers/s3ObjectStorage");

      await expect(saveObject({ buffer: Buffer.from("x"), key: "a.png", mimetype: "image/png" })).rejects.toMatchObject(
        { statusCode: 503, code: "UPLOAD_S3_NOT_CONFIGURED" }
      );
    });
  });

  describe("saveObject — SDK @aws-sdk/client-s3 khả dụng", () => {
    test("gọi PutObjectCommand và trả url theo publicBaseUrl khi có cấu hình", async () => {
      const send = jest.fn().mockResolvedValue({});
      jest.doMock("@aws-sdk/client-s3", () => ({
        S3Client: jest.fn().mockImplementation(() => ({ send })),
        PutObjectCommand: jest.fn().mockImplementation((args) => args),
      }));
      setEnv({
        UPLOAD_S3_BUCKET: "my-bucket",
        UPLOAD_S3_PUBLIC_BASE_URL: "https://cdn.example.com/",
      });
      const { saveObject } = require("../kernels/storage/drivers/s3ObjectStorage");

      const out = await saveObject({ buffer: Buffer.from("x"), key: "a/b.png", mimetype: "image/png" });

      expect(send).toHaveBeenCalled();
      expect(out).toEqual({
        key: "a/b.png",
        url: "https://cdn.example.com/a/b.png",
        provider: "s3",
      });
    });

    test("url theo endpoint (path-style) khi không có publicBaseUrl", async () => {
      const send = jest.fn().mockResolvedValue({});
      jest.doMock("@aws-sdk/client-s3", () => ({
        S3Client: jest.fn().mockImplementation(() => ({ send })),
        PutObjectCommand: jest.fn().mockImplementation((args) => args),
      }));
      setEnv({
        UPLOAD_S3_BUCKET: "my-bucket",
        UPLOAD_S3_ENDPOINT: "https://minio.local:9000/",
      });
      const { saveObject } = require("../kernels/storage/drivers/s3ObjectStorage");

      const out = await saveObject({ buffer: Buffer.from("x"), key: "a.png", mimetype: "image/png" });

      expect(out.url).toBe("https://minio.local:9000/my-bucket/a.png");
    });

    test("url AWS mặc định khi không có publicBaseUrl/endpoint", async () => {
      const send = jest.fn().mockResolvedValue({});
      jest.doMock("@aws-sdk/client-s3", () => ({
        S3Client: jest.fn().mockImplementation(() => ({ send })),
        PutObjectCommand: jest.fn().mockImplementation((args) => args),
      }));
      setEnv({ UPLOAD_S3_BUCKET: "my-bucket", UPLOAD_S3_REGION: "ap-southeast-1" });
      const { saveObject } = require("../kernels/storage/drivers/s3ObjectStorage");

      const out = await saveObject({ buffer: Buffer.from("x"), key: "a.png", mimetype: "image/png" });

      expect(out.url).toBe("https://my-bucket.s3.ap-southeast-1.amazonaws.com/a.png");
    });
  });

  describe("saveObject — SDK không cài được (require throw)", () => {
    test("simulateLocal=false → throw 503 UPLOAD_S3_SDK_MISSING", async () => {
      jest.doMock("@aws-sdk/client-s3", () => {
        throw new Error("Cannot find module '@aws-sdk/client-s3'");
      });
      setEnv({ UPLOAD_S3_BUCKET: "my-bucket", UPLOAD_S3_SIMULATE_LOCAL: "false" });
      const { saveObject } = require("../kernels/storage/drivers/s3ObjectStorage");

      await expect(saveObject({ buffer: Buffer.from("x"), key: "a.png", mimetype: "image/png" })).rejects.toMatchObject(
        { statusCode: 503, code: "UPLOAD_S3_SDK_MISSING" }
      );
    });

    test("simulateLocal=true → ghi file vào .s3-stub và trả provider s3-simulated", async () => {
      jest.doMock("@aws-sdk/client-s3", () => {
        throw new Error("Cannot find module '@aws-sdk/client-s3'");
      });
      const tmpDir = path.join(__dirname, "__tmp_upload_test__");
      setEnv({
        UPLOAD_S3_BUCKET: "my-bucket",
        UPLOAD_S3_SIMULATE_LOCAL: "true",
        UPLOAD_LOCAL_DIR: tmpDir,
      });
      const { saveObject } = require("../kernels/storage/drivers/s3ObjectStorage");

      const out = await saveObject({ buffer: Buffer.from("hello"), key: "sim/a.png", mimetype: "image/png" });

      expect(out.provider).toBe("s3-simulated");
      const written = fs.readFileSync(path.join(tmpDir, ".s3-stub", "sim", "a.png"));
      expect(written.toString()).toBe("hello");

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe("deleteObject", () => {
    test("no-op — không throw, resolve bình thường", async () => {
      setEnv({ UPLOAD_S3_BUCKET: "my-bucket" });
      const { deleteObject } = require("../kernels/storage/drivers/s3ObjectStorage");
      await expect(deleteObject("a.png")).resolves.toBeUndefined();
    });
  });
});
