const { cleanupExpiredDraftShares } = require("../../modules/config/services/scenarioDraftShareService");
const { logInfo, logWarn } = require("../logging/appLogger");

const INTERVAL_MS = 60 * 60 * 1000; // 1 giờ

async function runOnce() {
  try {
    const deleted = await cleanupExpiredDraftShares();
    if (deleted > 0) {
      logInfo("[scenarioDraftShareCleanupJob] Đã xoá draft share hết hạn", { deleted });
    }
  } catch (err) {
    logWarn("[scenarioDraftShareCleanupJob] Lỗi khi dọn dẹp", { message: err.message || String(err) });
  }
}

function startScenarioDraftShareCleanupJob() {
  if (process.env.NODE_ENV === "test") return;

  runOnce();
  const timer = setInterval(runOnce, INTERVAL_MS);
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

module.exports = { startScenarioDraftShareCleanupJob, runOnce };
