const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  // Kiểm tra xem header có chứa token không
  if (!authHeader) {
    return res.status(403).json({ message: "Token không được cung cấp" });
  }

  // Lấy token từ header
  const token = authHeader.split(" ")[1];

  // Kiểm tra tính hợp lệ của token
  jwt.verify(token, "secretKey", (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Token không hợp lệ" });
    }

    // Lưu thông tin người dùng vào request và tiếp tục
    req.user = decoded;
    next();
  });
};

const verifyAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Bạn không có quyền truy cập admin" });
  }
  next();
};

module.exports = { verifyToken, verifyAdmin };