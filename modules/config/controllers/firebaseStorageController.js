const { isFirebaseReady } = require("../../../kernels/firebaseAdmin");
const firebaseStorageService = require("../services/firebaseStorageService");

exports.getStatus = (req, res) => {
  const ready = isFirebaseReady();
  res.status(200).json({
    firestoreAndStorage: ready,
    maxFileMb: firebaseStorageService.getMaxBytes() / 1024 / 1024,
    attachmentsPrefix: firebaseStorageService.getAttachmentsPrefix(),
  });
};

exports.uploadFile = async (req, res) => {
  const userId = String(req.user.id);
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "Thiếu file (field tên: file)." });
    }
    const meta = await firebaseStorageService.uploadUserFile(
      userId,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    res.status(201).json({ message: "Đã tải lên Storage.", file: meta });
  } catch (error) {
    console.error("[firebase] Upload Storage:", error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

exports.listFiles = async (req, res) => {
  const userId = String(req.user.id);
  try {
    const files = await firebaseStorageService.listUserFiles(userId);
    res.status(200).json({ files });
  } catch (error) {
    console.error("[firebase] List Storage:", error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

exports.deleteFile = async (req, res) => {
  const userId = String(req.user.id);
  const fileName = req.body?.fileName ?? req.query?.fileName;
  try {
    if (!fileName || typeof fileName !== "string") {
      return res.status(400).json({ error: "Thiếu fileName (tên file trong thư mục của bạn)." });
    }
    await firebaseStorageService.deleteUserFile(userId, fileName);
    res.status(200).json({ message: "Đã xóa file." });
  } catch (error) {
    console.error("[firebase] Delete Storage:", error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

exports.signedDownloadUrl = async (req, res) => {
  const userId = String(req.user.id);
  const fileName = req.query?.fileName;
  const expiresMinutes = req.query?.expiresMinutes;
  try {
    if (!fileName || typeof fileName !== "string") {
      return res.status(400).json({ error: "Thiếu query fileName." });
    }
    const result = await firebaseStorageService.getSignedDownloadUrl(
      userId,
      fileName,
      expiresMinutes
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("[firebase] Signed URL:", error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};
