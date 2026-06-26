/**
 * Driver Cloudinary — dịch vụ lưu ảnh chuyên dụng, free tier rộng, không cần
 * tài khoản cloud lớn (S3/Firebase). Trả về URL public cố định (secure_url) +
 * CDN sẵn có, phù hợp lưu trong DB (FeatureImage hiển thị vĩnh viễn).
 */
const cloudinary = require("cloudinary").v2;
const { getCloudinaryConfig } = require("../uploadStorageConfig");

let configured = false;

function ensureConfigured() {
  const cfg = getCloudinaryConfig();
  if (!cfg.cloudName || !cfg.apiKey || !cfg.apiSecret) {
    const err = new Error(
      "Cloudinary chưa được cấu hình. Đặt CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET."
    );
    err.statusCode = 503;
    err.code = "UPLOAD_CLOUDINARY_NOT_CONFIGURED";
    throw err;
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: cfg.cloudName,
      api_key: cfg.apiKey,
      api_secret: cfg.apiSecret,
      secure: true,
    });
    configured = true;
  }
  return cfg;
}

/**
 * @param {{ buffer: Buffer, key: string, mimetype: string }} input
 */
async function saveObject({ buffer, key, mimetype }) {
  const cfg = ensureConfigured();
  const publicId = key.replace(/\.[a-z0-9]+$/i, "");
  const dataUri = `data:${mimetype};base64,${buffer.toString("base64")}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    public_id: publicId,
    folder: cfg.folder,
    resource_type: "image",
    overwrite: false,
    unique_filename: false,
  });

  return {
    key: result.public_id,
    url: result.secure_url,
    provider: "cloudinary",
  };
}

async function deleteObject(key) {
  if (!key) return;
  ensureConfigured();
  await cloudinary.uploader.destroy(key, { resource_type: "image" });
}

module.exports = {
  saveObject,
  deleteObject,
};
