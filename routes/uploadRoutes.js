const express = require("express");
const multer = require("multer");
const upload = require("../kernels/middlewares/uploadMiddleware");
const { verifyToken } = require("../kernels/middlewares/authMiddleware");
const { sendError, sendSuccess } = require("../kernels/middlewares/errorHandler");
const { createSimpleRateLimit } = require("../kernels/middlewares/simpleRateLimit");
const objectUploadService = require("../modules/upload/services/objectUploadService");

const router = express.Router();

/** Mỗi upload tốn 1 lượt gọi tới storage provider (Cloudinary...) — giới hạn chặt hơn route đọc thường. */
const uploadRateLimit = createSimpleRateLimit({
  windowMs: 60 * 1000,
  maxRequests: Number(process.env.UPLOAD_RL_PER_MIN ?? 10),
});

/** Bọc multer để lỗi (quá kích thước, sai loại file) trả 400 gọn — không rơi xuống 500. */
function uploadImageWithMulterErrors(req, res, next) {
  upload.single("image")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const code =
        err.code === "LIMIT_FILE_SIZE" ? "UPLOAD_FILE_TOO_LARGE" : "UPLOAD_INVALID_FILE_TYPE";
      return sendError(res, 400, err.message, code);
    }
    if (err) return next(err);
    return next();
  });
}

router.post("/", verifyToken, uploadRateLimit, uploadImageWithMulterErrors, async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, 400, "Không có file được tải lên.", "UPLOAD_FILE_MISSING");
    }

    const stored = await objectUploadService.saveImage({
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      userId: req.user?.id,
    });

    return sendSuccess(res, 200, "Tải ảnh thành công", {
      url: stored.url,
      key: stored.key,
      provider: stored.provider,
    });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    const code = error.code || "UPLOAD_FAILED";
    return sendError(res, status, error.message || "Upload thất bại", code);
  }
});

module.exports = router;
