const multer = require("multer");

/** Bộ nhớ — giới hạn an toàn; kích thước thật kiểm tra thêm trong firebaseStorageService (FIREBASE_STORAGE_MAX_MB). */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

module.exports = upload;
