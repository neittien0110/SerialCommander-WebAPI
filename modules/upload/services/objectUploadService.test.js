jest.mock("../../../kernels/storage/uploadStorageConfig", () => ({
  getUploadStorageDriver: jest.fn().mockReturnValue("local"),
  DRIVERS: { S3: "s3", CLOUDINARY: "cloudinary", LOCAL: "local" },
}));
jest.mock("../../../kernels/logging/appLogger", () => ({ logWarn: jest.fn() }));
jest.mock("../../../kernels/storage/drivers/localObjectStorage", () => ({
  saveObject: jest.fn(),
  deleteObject: jest.fn(),
}));
jest.mock("../../../kernels/storage/drivers/s3ObjectStorage", () => ({
  saveObject: jest.fn(),
  deleteObject: jest.fn(),
}));
jest.mock("../../../kernels/storage/drivers/cloudinaryObjectStorage", () => ({
  saveObject: jest.fn(),
  deleteObject: jest.fn(),
}));

const { getUploadStorageDriver } = require("../../../kernels/storage/uploadStorageConfig");
const { logWarn } = require("../../../kernels/logging/appLogger");
const localDriver = require("../../../kernels/storage/drivers/localObjectStorage");
const s3Driver = require("../../../kernels/storage/drivers/s3ObjectStorage");
const cloudinaryDriver = require("../../../kernels/storage/drivers/cloudinaryObjectStorage");

const {
  saveImage,
  deleteImage,
  deleteImageByUrl,
  buildObjectKey,
  getStorageDriver,
} = require("./objectUploadService");

beforeEach(() => jest.clearAllMocks());

// ─── Magic bytes helpers ─────────────────────────────────────────────────────
describe("saveImage — assertAllowedImage", () => {
  test("400 UPLOAD_INVALID_FILE_TYPE cho mimetype không được phép", async () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    await expect(saveImage({ buffer: buf, mimetype: "image/gif", originalname: "x.gif" }))
      .rejects.toMatchObject({ statusCode: 400, code: "UPLOAD_INVALID_FILE_TYPE" });
  });
});

describe("saveImage — assertRealImageContent", () => {
  test("400 UPLOAD_FILE_CONTENT_MISMATCH khi magic bytes sai", async () => {
    const fakeJpeg = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    await expect(saveImage({ buffer: fakeJpeg, mimetype: "image/jpeg", originalname: "x.jpg" }))
      .rejects.toMatchObject({ statusCode: 400, code: "UPLOAD_FILE_CONTENT_MISMATCH" });
  });

  test("400 UPLOAD_FILE_CONTENT_MISMATCH khi buffer quá ngắn", async () => {
    const shortBuf = Buffer.from([0xff]);
    await expect(saveImage({ buffer: shortBuf, mimetype: "image/jpeg", originalname: "x.jpg" }))
      .rejects.toMatchObject({ statusCode: 400, code: "UPLOAD_FILE_CONTENT_MISMATCH" });
  });
});

describe("saveImage — 400 khi thiếu buffer", () => {
  test("400 UPLOAD_FILE_MISSING khi buffer undefined", async () => {
    await expect(saveImage({ mimetype: "image/jpeg" }))
      .rejects.toMatchObject({ statusCode: 400, code: "UPLOAD_FILE_MISSING" });
  });

  test("400 UPLOAD_FILE_MISSING khi buffer.length = 0", async () => {
    await expect(saveImage({ buffer: Buffer.alloc(0), mimetype: "image/jpeg" }))
      .rejects.toMatchObject({ statusCode: 400, code: "UPLOAD_FILE_MISSING" });
  });
});

describe("saveImage — success", () => {
  test("gọi localDriver.saveObject với JPEG hợp lệ", async () => {
    getUploadStorageDriver.mockReturnValue("local");
    localDriver.saveObject.mockResolvedValue({ key: "user/file.jpg", url: "/uploads/user/file.jpg" });
    const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const result = await saveImage({ buffer: jpegBuf, mimetype: "image/jpeg", originalname: "photo.jpg", userId: 1 });
    expect(localDriver.saveObject).toHaveBeenCalled();
    expect(result).toHaveProperty("url");
  });

  test("gọi s3Driver.saveObject khi UPLOAD_STORAGE_DRIVER=s3", async () => {
    getUploadStorageDriver.mockReturnValue("s3");
    s3Driver.saveObject.mockResolvedValue({ key: "1/a.png", url: "https://s3.example.com/a.png" });
    const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const result = await saveImage({ buffer: pngBuf, mimetype: "image/png", originalname: "img.png", userId: 1 });
    expect(s3Driver.saveObject).toHaveBeenCalled();
    expect(result.url).toBe("https://s3.example.com/a.png");
  });
});

// ─── getStorageDriver ────────────────────────────────────────────────────────
describe("getStorageDriver", () => {
  test("trả localDriver khi driver=local", () => {
    getUploadStorageDriver.mockReturnValue("local");
    expect(getStorageDriver()).toBe(localDriver);
  });

  test("trả s3Driver khi driver=s3", () => {
    getUploadStorageDriver.mockReturnValue("s3");
    expect(getStorageDriver()).toBe(s3Driver);
  });

  test("trả cloudinaryDriver khi driver=cloudinary", () => {
    getUploadStorageDriver.mockReturnValue("cloudinary");
    expect(getStorageDriver()).toBe(cloudinaryDriver);
  });
});

// ─── buildObjectKey ──────────────────────────────────────────────────────────
describe("buildObjectKey", () => {
  test("tạo key có pattern {userId}/{timestamp}-{rand}.ext", () => {
    const key = buildObjectKey("photo.jpg", "42");
    expect(key).toMatch(/^42\/\d+-[a-f0-9]{16}\.jpg$/);
  });

  test("dùng .bin khi extension không được phép", () => {
    const key = buildObjectKey("malware.exe", "1");
    expect(key).toMatch(/\.bin$/);
  });

  test("dùng 'anon' khi userId không truyền", () => {
    const key = buildObjectKey("img.png");
    expect(key).toMatch(/^anon\//);
  });

  test("extension .jpg → .jpg (lowercase normalize)", () => {
    const key = buildObjectKey("photo.JPG", "99");
    expect(key).toMatch(/\.jpg$/);
  });
});

// ─── deleteImageByUrl ────────────────────────────────────────────────────────
describe("deleteImageByUrl", () => {
  test("gọi cloudinaryDriver.deleteObject cho URL cloudinary", async () => {
    cloudinaryDriver.deleteObject.mockResolvedValue(undefined);
    await deleteImageByUrl("https://res.cloudinary.com/mycloud/image/upload/v1234/users/avatar.jpg");
    expect(cloudinaryDriver.deleteObject).toHaveBeenCalledWith("users/avatar");
  });

  test("no-op cho URL googleapis.com (Firebase Storage đã bị xóa)", async () => {
    await deleteImageByUrl("https://storage.googleapis.com/mybucket/users/img.png");
    expect(localDriver.deleteObject).not.toHaveBeenCalled();
    expect(cloudinaryDriver.deleteObject).not.toHaveBeenCalled();
  });

  test("gọi localDriver.deleteObject cho URL /uploads/...", async () => {
    localDriver.deleteObject.mockResolvedValue(undefined);
    await deleteImageByUrl("http://localhost/uploads/user/photo.jpg");
    expect(localDriver.deleteObject).toHaveBeenCalledWith("user/photo.jpg");
  });

  test("no-op (không throw) cho URL không khớp pattern", async () => {
    await expect(deleteImageByUrl("https://unknown.cdn.com/file.jpg")).resolves.toBeUndefined();
    expect(localDriver.deleteObject).not.toHaveBeenCalled();
  });

  test("no-op khi url rỗng/undefined", async () => {
    await expect(deleteImageByUrl("")).resolves.toBeUndefined();
    await expect(deleteImageByUrl(null)).resolves.toBeUndefined();
  });

  test("bắt lỗi từ driver.deleteObject và log warn, không throw", async () => {
    cloudinaryDriver.deleteObject.mockRejectedValue(new Error("network error"));
    await expect(
      deleteImageByUrl("https://res.cloudinary.com/c/image/upload/v1/obj.jpg")
    ).resolves.toBeUndefined();
    expect(logWarn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: "network error" }));
  });
});

// ─── deleteImage ─────────────────────────────────────────────────────────────
describe("deleteImage", () => {
  test("no-op khi key rỗng/falsy", async () => {
    await deleteImage("");
    await deleteImage(null);
    expect(localDriver.deleteObject).not.toHaveBeenCalled();
  });

  test("gọi driver.deleteObject khi key có giá trị", async () => {
    getUploadStorageDriver.mockReturnValue("local");
    localDriver.deleteObject.mockResolvedValue(undefined);
    await deleteImage("user/photo.jpg");
    expect(localDriver.deleteObject).toHaveBeenCalledWith("user/photo.jpg");
  });
});
