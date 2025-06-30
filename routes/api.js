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
});

// Config routes for user
router.group("/configs", verifyToken, (router) => {
  router.post("/import", configController.importConfig);
  router.get("/myconfigs", configController.getConfigsByUserId);
  router.delete("/:configId", configController.deleteConfig);
  router.get("/:id", configController.getConfigById);
  router.post("/share/:configId", configController.shareConfig);
  router.get("/export/:configId", configController.exportConfig);


});
//route public
router.get("/share/:shareCode", configController.getSharedConfig);

// Admin routes
router.group("/admin/shared-configs", verifyToken, (router) => {
  router.use(verifyAdmin);
  router.get("/", adminController.getSharedConfigs);
  router.delete("/:id", adminController.deleteSharedConfig);
  router.patch("/:id/approve", adminController.approveSharedConfig);
});

module.exports = router;
