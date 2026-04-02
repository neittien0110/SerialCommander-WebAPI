const express = require('express');
const upload = require('../kernels/middlewares/uploadMiddleware');
const { verifyToken } = require('../kernels/middlewares/authMiddleware');

const router = express.Router();

// Route upload ảnh (yêu cầu đăng nhập) — mounted tại /api/upload
router.post('/', verifyToken, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Không có file được tải lên.' });
    }
    const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 2999}`;
    const imageUrl = `${baseUrl}/uploads/${req.file.filename}`;
    return res.status(200).json({ url: imageUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
