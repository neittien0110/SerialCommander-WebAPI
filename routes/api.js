require("express-router-group");
const express = require("express");

const { verifyToken, verifyAdmin } = require("../kernels/middlewares/authMiddleware");
const { validate } = require("kernels/validations");
const scenarioController = require("../modules/config/controllers/scenarioController");
const adminController = require("../modules/admin/controllers/adminController");

const router = express.Router({ mergeParams: true });

// Middleware để đọc body dạng text (cho kiểm tra file .json thô)
const textBodyParser = express.text({ type: "text/plain", limit: "2mb" });


// Config routes for user:   verifyToken   validate([])
/// Các API thay đổi cấu hình serial: thêm, xóa, xuất, chia sẻ, 
router.group("/scenarios", verifyToken, (router) => {
  //------------------------------------------------
  router.post("/import", scenarioController.createScenario);
  router.post("/update/:scenarioId", scenarioController.updateScenario);
  router.get("/export/:scenarioId", scenarioController.exportScenarioById);  
  router.post("/share/:scenarioId", scenarioController.shareScenarioById);
  //------------------------------------------------
  router.get("/myscenarios", scenarioController.getScenariosByUserId);
  router.delete("/:scenarioId", scenarioController.deleteScenario);
  router.get("/:scenarioId", scenarioController.getScenarioById);
});

/// Các API lấy về cấu hình dựa trên mã chia sẻ
router.post("/verify", scenarioController.verifyScenario);
/// Kiểm tra cú pháp file .json kịch bản (gửi nội dung file với Content-Type: text/plain)
router.post("/verify-file", textBodyParser, scenarioController.verifyScenarioFile);
router.get("/share/:shareCode", scenarioController.getScenarioByShareCode);

// Admin routes
router.group("/admin/shared-configs", verifyToken, (router) => {
  router.use(verifyAdmin);
  router.get("/", adminController.getSharedConfigs);
  router.delete("/:id", adminController.deleteSharedConfig);
  router.patch("/:id/approve", adminController.approveSharedConfig);
});

module.exports = router;
