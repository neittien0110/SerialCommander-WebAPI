const express = require("express");
const router = express.Router();
const { verifyToken }  = require("../kernels/middlewares/authMiddleware");
const userActivityController = require("../modules/user/controllers/userActivityController");
const userProfileController = require("../modules/user/controllers/userProfileController");

router.get("/profile", verifyToken, userProfileController.getProfile);
router.patch("/profile", verifyToken, userProfileController.updateProfile);

// User Activity routes
router.get("/activities", verifyToken, userActivityController.getUserActivities);
router.get("/activities/stats", verifyToken, userActivityController.getUserActivityStats);
router.post("/activities", verifyToken, userActivityController.createActivity);

module.exports = router;
