require("express-router-group");
const express = require("express");

const { verifyToken, verifyAdmin } = require("../kernels/middlewares/authMiddleware");
const { validate } = require("kernels/validations");
const scenarioController  = require("../modules/config/controllers/scenarioController");
const adminController = require("../modules/admin/controllers/adminController");

const router = express.Router({ mergeParams: true });


// Config routes for user:   verifyToken   validate([])
/// Các API thay đổi cấu hình serial: thêm, xóa, xuất, chia sẻ, 
router.group("/scenarios", verifyToken, (router) => {
  //------------------------------------------------
  router.post("/import", scenarioController.createScenario);
  router.get("/export/:scenarioId", scenarioController.exportScenarioById);  
  router.post("/share/:scenarioId", scenarioController.shareScenarioById);
  //------------------------------------------------
  router.get("/myscenarios", scenarioController.getScenariosByUserId);
  router.delete("/:scenarioId", scenarioController.deleteScenario);
  router.get("/:scenarioId", scenarioController.getScenarioById);
});

/// Các API lấy về cấu hình dựa trên mã chia sẻ
router.post("/verify", scenarioController.verifyScenario);
router.get("/share/:shareCode", scenarioController.getScenarioByShareCode);

// Admin routes
router.group("/admin/shared-configs", verifyToken, (router) => {
  router.use(verifyAdmin);
  router.get("/", adminController.getSharedConfigs);
  router.delete("/:id", adminController.deleteSharedConfig);
  router.patch("/:id/approve", adminController.approveSharedConfig);
});

module.exports = router;
