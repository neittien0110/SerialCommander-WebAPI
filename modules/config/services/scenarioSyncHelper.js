/**
 * Enqueue đồng bộ Firestore SAU khi MySQL đã commit.
 * MySQL là source of truth — enqueue lỗi (Redis down…) KHÔNG được làm request thất bại.
 */
const { logError } = require("../../../kernels/logging/appLogger");
const scenarioSyncStatus = require("../../../kernels/scenarioSyncStatus");
const { enqueueScenarioFirestoreSync } = require("./scenarioSyncEnqueue");

/**
 * @param {string} operationType
 * @param {string} scenarioId
 * @param {object|null} payload
 * @returns {Promise<"pending"|"degraded">} syncStatus: "pending" (đã vào hàng đợi) | "degraded" (chưa vào, cần resync sau).
 */
async function enqueueAfterCommit(operationType, scenarioId, payload) {
  try {
    await enqueueScenarioFirestoreSync(operationType, scenarioId, payload);
    return "pending";
  } catch (error) {
    logError("scenario sync enqueue degraded — MySQL đã commit, nội dung sẽ đồng bộ lại sau", {
      operationType,
      scenarioId,
      message: error.message || String(error),
      code: error.code,
    });
    // Best-effort đánh dấu degraded để list/detail API hiển thị đúng trạng thái.
    await scenarioSyncStatus.setScenarioSyncStatus(scenarioId, "degraded");
    return "degraded";
  }
}

module.exports = {
  enqueueAfterCommit,
};
