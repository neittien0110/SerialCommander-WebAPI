const path = require("path");

const DRIVERS = {
  LOCAL: "local",
  S3: "s3",
  CLOUDINARY: "cloudinary",
};

function getUploadStorageDriver() {
  const raw = String(process.env.UPLOAD_STORAGE_DRIVER || DRIVERS.LOCAL).toLowerCase();
  if (raw === DRIVERS.S3) return DRIVERS.S3;
  if (raw === DRIVERS.CLOUDINARY) return DRIVERS.CLOUDINARY;
  return DRIVERS.LOCAL;
}

function getCloudinaryConfig() {
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
    folder: process.env.CLOUDINARY_UPLOAD_FOLDER || "serial-commander",
  };
}

function getLocalUploadDir() {
  const rel = process.env.UPLOAD_LOCAL_DIR || "uploads";
  return path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
}

function getPublicApiBaseUrl() {
  return (
    process.env.API_BASE_URL ||
    process.env.UPLOAD_PUBLIC_BASE_URL ||
    `http://localhost:${process.env.PORT || 2999}`
  ).replace(/\/+$/, "");
}

function getS3Config() {
  return {
    bucket: process.env.UPLOAD_S3_BUCKET || "",
    region: process.env.UPLOAD_S3_REGION || "us-east-1",
    endpoint: process.env.UPLOAD_S3_ENDPOINT || "",
    publicBaseUrl: (process.env.UPLOAD_S3_PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
    simulateLocal: process.env.UPLOAD_S3_SIMULATE_LOCAL === "true",
    accessKeyId: process.env.UPLOAD_S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.UPLOAD_S3_SECRET_ACCESS_KEY || "",
  };
}

module.exports = {
  DRIVERS,
  getUploadStorageDriver,
  getLocalUploadDir,
  getPublicApiBaseUrl,
  getS3Config,
  getCloudinaryConfig,
};
