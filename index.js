require("dotenv").config({
  path: "./.env",
});
require("rootpath")();
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path"); // Import path để xử lý đường dẫn
const router = require("routes/api");
const { swaggerUIServe, swaggerUISetup } = require("kernels/api-docs");
const authRoutes = require("routes/auth");
const userRoutes = require("routes/user");
const uploadRoutes = require('routes/uploadRoutes');
const cors = require('cors');
const app = express();
app.disable("x-powered-by");

app.use(bodyParser.json());
app.use(express.json());
app.use(cors());

// Thêm dòng này để phục vụ các tệp trong thư mục uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Các định tuyến khác
app.use("/", router);
app.use("/api-docs", swaggerUIServe, swaggerUISetup);
app.use("/api/auth", authRoutes);  // Định tuyến login, register
app.use("/api/user", userRoutes);  // Định tuyến của user cần xác thực
app.use("/api/upload", uploadRoutes);

module.exports = app;
