const express = require('express');
const upload = require('../kernels/middlewares/uploadMiddleware');  

const router = express.Router();  // Khai báo router

// Route upload ảnh
router.post('/upload', upload.single('image'), (req, res) => {
  try {
    // Nếu upload thành công, trả về URL của ảnh
    const imageUrl = `http://localhost:3000/uploads/${req.file.filename}`;
    return res.status(200).json({ url: imageUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
