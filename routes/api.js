require("express-router-group");
const express = require("express");

const { verifyToken, verifyAdmin } = require("../kernels/middlewares/authMiddleware");
const { validate } = require("kernels/validations");
const exampleController = require("modules/examples/controllers/exampleController");
const configController = require("../modules/config/controllers/configController");
const adminController = require("../modules/admin/controllers/adminController");

const router = express.Router({ mergeParams: true });

// Example route
router.group("/example", validate([]), (router) => {
  router.get("/", exampleController.exampleRequest);
  //router.get("/abc/:configId", configController.shareConfig);
});



// Config routes for user:   verifyToken   validate([])
/// Các API thay đổi cấu hình serial: thêm, xóa, xuất, chia sẻ, 
router.group("/scenarios", verifyToken, (router) => {
  //------------------------------------------------
  router.post("/import", configController.importScenario);
  router.get("/export/:scenarioId", configController.exportScenario);  
  router.post("/share/:scenarioId", configController.shareConfig);
  //------------------------------------------------
  router.get("/myscenarios", configController.getScenariosByUserId);
  router.delete("/:scenarioId", configController.deleteConfig);
  router.get("/:id", configController.getScenarioById);
});

/// Các API lấy về cấu hình dựa trên mã chia sẻ
router.get("/share/:shareCode", configController.getScenarioByShareCode);

// Admin routes
router.group("/admin/shared-configs", verifyToken, (router) => {
  router.use(verifyAdmin);
  router.get("/", adminController.getSharedConfigs);
  router.delete("/:id", adminController.deleteSharedConfig);
  router.patch("/:id/approve", adminController.approveSharedConfig);
});

module.exports = router;
