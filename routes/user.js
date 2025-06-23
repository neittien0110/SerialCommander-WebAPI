const express = require("express");
const router = express.Router();
const { verifyToken }  = require("../kernels/middlewares/authMiddleware");

router.get("/profile", verifyToken, (req, res) => {
  res.json({ message: "Đây là thông tin profile của bạn", user: req.user });
});

module.exports = router;
