require("express-router-group");
const express = require("express");

const { verifyToken } = require("../kernels/middlewares/authMiddleware");
const { createSimpleRateLimit } = require("../kernels/middlewares/simpleRateLimit");
const { sendError } = require("../kernels/middlewares/errorHandler");
const scenarioController = require("../modules/config/controllers/scenarioController");

const SHARE_CODE_PATTERN = /^[a-z0-9]{4,16}$/i;

function validateShareCode(req, res, next) {
  const { shareCode } = req.params;
  if (!shareCode || !SHARE_CODE_PATTERN.test(shareCode)) {
    return sendError(res, 400, "Share code không hợp lệ.", "SHARE_CODE_INVALID");
  }
  next();
}

const router = express.Router({ mergeParams: true });
const verifyRateLimit = createSimpleRateLimit({ windowMs: 60 * 1000, maxRequests: 40 });
const scenarioMutateRateLimit = createSimpleRateLimit({
  windowMs: 60 * 1000,
  maxRequests: Number(process.env.SCENARIO_RL_MUTATE_PER_MIN ?? 30),
});
const scenarioReadRateLimit = createSimpleRateLimit({
  windowMs: 60 * 1000,
  maxRequests: Number(process.env.SCENARIO_RL_READ_PER_MIN ?? 120),
});
const shareCodePublicRateLimit = createSimpleRateLimit({
  windowMs: 60 * 1000,
  maxRequests: Number(process.env.SCENARIO_RL_SHARE_PUBLIC_PER_MIN ?? 20),
});
const scenarioPublicListRateLimit = createSimpleRateLimit({
  windowMs: 60 * 1000,
  maxRequests: Number(process.env.SCENARIO_RL_PUBLIC_LIST_PER_MIN ?? 30),
});

const textBodyParser = express.text({ type: "text/plain", limit: "2mb" });

// Public: danh sách scenario công khai — PHẢI đứng trước router.group("/scenarios", verifyToken, ...)
// để không bị route ":scenarioId" (yêu cầu auth) nuốt mất "/scenarios/public".
router.get("/scenarios/public", scenarioPublicListRateLimit, scenarioController.getPublicScenarios);

router.group("/scenarios", verifyToken, (router) => {
  router.post("/import", scenarioMutateRateLimit, scenarioController.createScenario);
  router.post("/update/:scenarioId", scenarioMutateRateLimit, scenarioController.updateScenario);
  router.get("/export/:scenarioId", scenarioReadRateLimit, scenarioController.exportScenarioById);
  router.post("/share/:scenarioId", scenarioMutateRateLimit, scenarioController.shareScenarioById);
  router.get("/myscenarios", scenarioReadRateLimit, scenarioController.getScenariosByUserId);
  router.delete("/:scenarioId", scenarioMutateRateLimit, scenarioController.deleteScenario);
  router.get("/:scenarioId", scenarioReadRateLimit, scenarioController.getScenarioById);
});

router.post("/verify", verifyRateLimit, scenarioController.verifyScenario);
router.post("/verify-file", verifyRateLimit, textBodyParser, scenarioController.verifyScenarioFile);
router.get("/share/:shareCode/availability", shareCodePublicRateLimit, validateShareCode, scenarioController.getShareAvailability);
router.get("/share/:shareCode", shareCodePublicRateLimit, validateShareCode, scenarioController.getScenarioByShareCode);

module.exports = router;
