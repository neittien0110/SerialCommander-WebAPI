const path = require("path");
const crypto = require("crypto");
const {
  getUploadStorageDriver,
  DRIVERS,
} = require("../../../kernels/storage/uploadStorageConfig");
const { logWarn } = require("../../../kernels/logging/appLogger");
const localStorage = require("../../../kernels/storage/drivers/localObjectStorage");
const s3Storage = require("../../../kernels/storage/drivers/s3ObjectStorage");
const cloudinaryStorage = require("../../../kernels/storage/drivers/cloudinaryObjectStorage");

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/jpg"]);

/** Magic bytes thật của file — chặn trường hợp client giả mimetype (đổi tên .exe thành .png). */
const MAGIC_BYTES_BY_MIME = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/jpg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

function assertAllowedImage(mimetype) {
  if (!ALLOWED_IMAGE_TYPES.has(mimetype)) {
    const err = new Error("Invalid file type");
    err.statusCode = 400;
    err.code = "UPLOAD_INVALID_FILE_TYPE";
    throw err;
  }
}

function matchesMagicBytes(buffer, mimetype) {
  const signature = MAGIC_BYTES_BY_MIME[mimetype];
  if (!signature) return false;
  if (!buffer || buffer.length < signature.length) return false;
  return signature.every((byte, i) => buffer[i] === byte);
}

function assertRealImageContent(buffer, mimetype) {
  if (!matchesMagicBytes(buffer, mimetype)) {
    const err = new Error("Nội dung file không khớp với loại ảnh khai báo.");
    err.statusCode = 400;
    err.code = "UPLOAD_FILE_CONTENT_MISMATCH";
    throw err;
  }
}

/**
 * Suy ra { provider, key } từ URL đã lưu (FeatureImage) để xóa object cũ khi
 * thay ảnh / xóa scenario — không phụ thuộc driver đang active vì ảnh cũ có
 * thể được lưu bởi driver khác trước khi đổi UPLOAD_STORAGE_DRIVER.
 */
const DELETABLE_URL_PATTERNS = [
  {
    provider: "cloudinary",
    regex: /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/v\d+\/(.+?)\.[a-z0-9]+(?:[?#].*)?$/i,
    driver: cloudinaryStorage,
  },
  {
    provider: "local",
    regex: /\/uploads\/(.+)$/i,
    driver: localStorage,
  },
];

function extractDeletableObject(url) {
  if (typeof url !== "string" || !url) return null;
  for (const { provider, regex, driver } of DELETABLE_URL_PATTERNS) {
    const match = regex.exec(url);
    if (match) {
      return { provider, key: decodeURIComponent(match[1]), driver };
    }
  }
  return null;
}

/**
 * Xóa ảnh cũ theo URL đã lưu trong DB — best-effort, không throw để không
 * chặn flow chính (update/xóa scenario) khi cleanup thất bại.
 */
async function deleteImageByUrl(url) {
  const found = extractDeletableObject(url);
  if (!found) return;
  try {
    await found.driver.deleteObject(found.key);
  } catch (err) {
    logWarn("[upload] Xóa ảnh cũ thất bại — bỏ qua, không chặn flow chính.", {
      provider: found.provider,
      key: found.key,
      message: err.message || String(err),
    });
  }
}

function buildObjectKey(originalname, userId) {
  const ext = path.extname(originalname || "").toLowerCase() || ".bin";
  const safeExt = /^\.(jpe?g|png)$/.test(ext) ? ext : ".bin";
  const uid = userId ? String(userId) : "anon";
  const rand = crypto.randomBytes(8).toString("hex");
  return `${uid}/${Date.now()}-${rand}${safeExt}`;
}

function getStorageDriver() {
  const driver = getUploadStorageDriver();
  if (driver === DRIVERS.S3) {
    return s3Storage;
  }
  if (driver === DRIVERS.CLOUDINARY) {
    return cloudinaryStorage;
  }
  return localStorage;
}

/**
 * Lưu ảnh qua storage driver (local hoặc S3) — không ghi fs trực tiếp từ route.
 * @param {{ buffer: Buffer, originalname: string, mimetype: string, userId?: string|number }} input
 */
async function saveImage(input) {
  if (!input?.buffer?.length) {
    const err = new Error("Không có dữ liệu file.");
    err.statusCode = 400;
    err.code = "UPLOAD_FILE_MISSING";
    throw err;
  }
  assertAllowedImage(input.mimetype);
  assertRealImageContent(input.buffer, input.mimetype);

  const key = buildObjectKey(input.originalname, input.userId);
  const driver = getStorageDriver();
  return driver.saveObject({
    buffer: input.buffer,
    key,
    mimetype: input.mimetype,
  });
}

async function deleteImage(key) {
  if (!key) return;
  return getStorageDriver().deleteObject(key);
}

module.exports = {
  ALLOWED_IMAGE_TYPES,
  getStorageDriver,
  getUploadStorageDriver,
  saveImage,
  deleteImage,
  deleteImageByUrl,
  buildObjectKey,
};
