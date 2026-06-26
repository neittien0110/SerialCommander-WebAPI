const multer = require("multer");
const { ALLOWED_IMAGE_TYPES } = require("../../modules/upload/services/objectUploadService");

/** Giới hạn kích thước ảnh — cấu hình qua env, cùng convention với FIREBASE_STORAGE_MAX_MB. */
function maxBytes() {
  const mb = parseInt(process.env.UPLOAD_IMAGE_MAX_MB || "5", 10);
  const n = Number.isFinite(mb) && mb > 0 ? mb : 5;
  return n * 1024 * 1024;
}

const fileFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname);
    err.message = `Loại file không được hỗ trợ: ${file.mimetype}. Chỉ nhận ${Array.from(ALLOWED_IMAGE_TYPES).join(", ")}.`;
    cb(err, false);
  }
};

/** Memory storage — buffer chuyển sang objectUploadService (local/S3). */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes() },
  fileFilter,
});

module.exports = upload;
module.exports.maxBytes = maxBytes;
