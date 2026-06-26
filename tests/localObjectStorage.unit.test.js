process.env.NODE_ENV = "test";

const fs = require("fs");
const os = require("os");
const path = require("path");

jest.mock("../kernels/storage/uploadStorageConfig", () => ({
  getLocalUploadDir: jest.fn(),
  getPublicApiBaseUrl: jest.fn().mockReturnValue("http://localhost:2999"),
}));

const { getLocalUploadDir, getPublicApiBaseUrl } = require("../kernels/storage/uploadStorageConfig");
const { saveObject, deleteObject } = require("../kernels/storage/drivers/localObjectStorage");

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "local-storage-test-"));
  getLocalUploadDir.mockReturnValue(tmpDir);
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  jest.clearAllMocks();
});

describe("localObjectStorage", () => {
  describe("saveObject", () => {
    test("viết file và trả {key, url, provider}", async () => {
      const buf = Buffer.from("hello");
      const result = await saveObject({ buffer: buf, key: "user/photo.jpg", mimetype: "image/jpeg" });

      expect(result.key).toBe("user/photo.jpg");
      expect(result.url).toBe("http://localhost:2999/uploads/user/photo.jpg");
      expect(result.provider).toBe("local");

      const written = fs.readFileSync(path.join(tmpDir, "user/photo.jpg"));
      expect(written.toString()).toBe("hello");
    });

    test("tạo subdirectory nếu chưa có", async () => {
      await saveObject({ buffer: Buffer.from("x"), key: "a/b/c.png", mimetype: "image/png" });
      expect(fs.existsSync(path.join(tmpDir, "a/b/c.png"))).toBe(true);
    });

    test("url sử dụng getPublicApiBaseUrl()", async () => {
      getPublicApiBaseUrl.mockReturnValue("https://api.example.com");
      const result = await saveObject({ buffer: Buffer.from("y"), key: "img.png", mimetype: "image/png" });
      expect(result.url).toBe("https://api.example.com/uploads/img.png");
    });
  });

  describe("deleteObject", () => {
    test("xóa file đã tồn tại", async () => {
      const filePath = path.join(tmpDir, "del.jpg");
      fs.writeFileSync(filePath, "data");
      await deleteObject("del.jpg");
      expect(fs.existsSync(filePath)).toBe(false);
    });

    test("không throw khi file không tồn tại (ENOENT)", async () => {
      await expect(deleteObject("no-such-file.jpg")).resolves.toBeUndefined();
    });
  });
});
