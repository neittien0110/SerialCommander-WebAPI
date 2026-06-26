process.env.NODE_ENV = "test";

require("rootpath")();

const fs = require("fs");
const path = require("path");
const objectUploadService = require("modules/upload/services/objectUploadService");

const testDir = path.join(process.cwd(), "uploads", "_test_uploads");

describe("objectUploadService", () => {
  beforeAll(() => {
    process.env.UPLOAD_STORAGE_DRIVER = "local";
    process.env.UPLOAD_LOCAL_DIR = testDir;
    process.env.API_BASE_URL = "http://localhost:2999";
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  const JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const PNG_BUFFER = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  ]);

  test("saveImage ghi local qua driver, không qua route", async () => {
    const out = await objectUploadService.saveImage({
      buffer: JPEG_BUFFER,
      originalname: "photo.jpg",
      mimetype: "image/jpeg",
      userId: 99,
    });

    expect(out.provider).toBe("local");
    expect(out.url).toContain("/uploads/");
    expect(fs.existsSync(path.join(testDir, out.key))).toBe(true);
  });

  test("từ chối mime không hợp lệ", async () => {
    await expect(
      objectUploadService.saveImage({
        buffer: Buffer.from("x"),
        originalname: "a.exe",
        mimetype: "application/octet-stream",
        userId: 1,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("từ chối khi nội dung file không khớp magic bytes của mimetype khai báo", async () => {
    await expect(
      objectUploadService.saveImage({
        buffer: Buffer.from("không phải ảnh thật, chỉ là text"),
        originalname: "fake.png",
        mimetype: "image/png",
        userId: 1,
      })
    ).rejects.toMatchObject({ statusCode: 400, code: "UPLOAD_FILE_CONTENT_MISMATCH" });
  });

  test("chấp nhận PNG có magic bytes hợp lệ", async () => {
    const out = await objectUploadService.saveImage({
      buffer: PNG_BUFFER,
      originalname: "real.png",
      mimetype: "image/png",
      userId: 2,
    });
    expect(out.provider).toBe("local");
  });

  describe("deleteImageByUrl — suy ra provider/key từ URL đã lưu, best-effort", () => {
    test("URL Cloudinary → gọi cloudinaryStorage.deleteObject với public_id đúng", async () => {
      const cloudinaryStorage = require("kernels/storage/drivers/cloudinaryObjectStorage");
      const spy = jest.spyOn(cloudinaryStorage, "deleteObject").mockResolvedValue(undefined);

      await objectUploadService.deleteImageByUrl(
        "https://res.cloudinary.com/demo/image/upload/v123/serial-commander/4/abc.png"
      );

      expect(spy).toHaveBeenCalledWith("serial-commander/4/abc");
      spy.mockRestore();
    });

    test("URL local (/uploads/...) → gọi localStorage.deleteObject với key đúng", async () => {
      const localStorage = require("kernels/storage/drivers/localObjectStorage");
      const spy = jest.spyOn(localStorage, "deleteObject").mockResolvedValue(undefined);

      await objectUploadService.deleteImageByUrl("http://localhost:2999/uploads/4/abc.png");

      expect(spy).toHaveBeenCalledWith("4/abc.png");
      spy.mockRestore();
    });

    test("URL không khớp pattern nào → no-op, không throw", async () => {
      await expect(
        objectUploadService.deleteImageByUrl("https://example.com/random.png")
      ).resolves.toBeUndefined();
    });

    test("url rỗng/null → no-op, không throw", async () => {
      await expect(objectUploadService.deleteImageByUrl(null)).resolves.toBeUndefined();
      await expect(objectUploadService.deleteImageByUrl("")).resolves.toBeUndefined();
    });

    test("driver.deleteObject lỗi → nuốt lỗi, không throw lên trên (best-effort)", async () => {
      const cloudinaryStorage = require("kernels/storage/drivers/cloudinaryObjectStorage");
      const spy = jest
        .spyOn(cloudinaryStorage, "deleteObject")
        .mockRejectedValue(new Error("cloudinary down"));

      await expect(
        objectUploadService.deleteImageByUrl(
          "https://res.cloudinary.com/demo/image/upload/v123/serial-commander/4/abc.png"
        )
      ).resolves.toBeUndefined();

      spy.mockRestore();
    });
  });
});
