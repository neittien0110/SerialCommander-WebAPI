require("dotenv").config({
  path: "./.env",
});
require("rootpath")();
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path"); // Import path để xử lý đường dẫn
const session = require("express-session");
const router = require("routes/api");
const { swaggerUIServe, swaggerUISetup } = require("kernels/api-docs");
const authRoutes = require("routes/auth");
const userRoutes = require("routes/user");
const uploadRoutes = require('routes/uploadRoutes');
const cors = require('cors');
const passport = require("./configs/passport");

const app = express();
app.disable("x-powered-by");

app.use(bodyParser.json());
app.use(express.json());

// Session configuration for Passport
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key-change-this",
    resave: false,
    saveUninitialized: false,
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// CORS configuration - allow credentials for OAuth
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
}));

// Thêm dòng này để phục vụ các tệp trong thư mục uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Root route - trả về thông tin API
app.get("/", (req, res) => {
  res.json({
    message: "Serial Commander API Server",
    version: "1.0.0",
    endpoints: {
      docs: "/api-docs",
      auth: "/api/auth",
      user: "/api/user",
      config: "/scenarios",
      upload: "/api/upload"
    },
    status: "running"
  });
});

// Các định tuyến khác
app.use("/", router);
app.use("/api-docs", swaggerUIServe, swaggerUISetup);
app.use("/api/auth", authRoutes);  // Định tuyến login, register
app.use("/api/user", userRoutes);  // Định tuyến của user cần xác thực
app.use("/api/upload", uploadRoutes);

module.exports = app;
