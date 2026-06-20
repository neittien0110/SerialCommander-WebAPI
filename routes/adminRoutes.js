require("express-router-group");
const express = require("express");

const { verifyToken, verifyAdmin } = require("../kernels/middlewares/authMiddleware");
const adminController = require("../modules/admin/controllers/adminController");

const router = express.Router({ mergeParams: true });

router.group("/shared-configs", verifyToken, (router) => {
  router.use(verifyAdmin);
  router.get("/", adminController.getSharedConfigs);
  router.delete("/:id", adminController.deleteSharedConfig);
  router.patch("/:id/approve", adminController.approveSharedConfig);
});

router.group("/ops/sync-jobs", verifyToken, (router) => {
  router.use(verifyAdmin);
  router.get("/", adminController.getSyncJobsOpsSummary);
  router.post("/reconcile-dlq", adminController.reconcileScenarioOutboxDlq);
});

router.group("/ops/metrics", verifyToken, (router) => {
  router.use(verifyAdmin);
  router.get("/", adminController.getOpsAppMetrics);
});

module.exports = router;
