/**
 * Watermark đồng bộ Firestore trên MySQL: SyncedAt >= ModifiedAt nghĩa là content
 * của lần sửa cuối đã lên Firestore. Mọi so sánh dùng giá trị trong DB (không so
 * đồng hồ app với đồng hồ DB — hai máy có thể lệch giờ):
 *
 * - Job sync mang theo snapshot ModifiedAt của dòng tại thời điểm enqueue.
 * - Worker mark SyncedAt = snapshot đó, và CHỈ khi ModifiedAt chưa đổi (user chưa
 *   save tiếp trong lúc job chạy) — nếu đã đổi thì để job mới / reconcile lo.
 * - Reconcile định kỳ quét các dòng SyncedAt NULL hoặc < ModifiedAt và re-enqueue
 *   từ Content MySQL — đây là lưới an toàn cho ca enqueue rớt ("degraded"), vốn
 *   trước đây mất dấu vĩnh viễn vì dấu degraded chỉ nằm trong Redis.
 */
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../models");
const { logWarn, logInfo } = require("./logging/appLogger");
const scenarioSyncQueue = require("./scenarioSyncQueue");
const scenarioSyncStatus = require("./scenarioSyncStatus");
const { isFirebaseReady } = require("./firebaseAdmin");

// Grace: bỏ qua dòng vừa sửa trong N giây — nhường đường cho luồng outbox bình thường
// (thường xong trong ~1-2s), tránh enqueue trùng. So bằng NOW() của chính MySQL.
const RECONCILE_GRACE_SEC = Math.max(5, Number(process.env.SCENARIO_SYNC_RECONCILE_GRACE_SEC || 15));
const RECONCILE_BATCH = Math.max(1, Math.min(50, Number(process.env.SCENARIO_SYNC_RECONCILE_BATCH || 20)));

/**
 * Đổi ISO/Date thành chuỗi wall-time 'YYYY-MM-DD HH:mm:ss' khớp đúng giá trị
 * DATETIME trong DB. BẮT BUỘC truyền STRING (không phải Date) qua replacements:
 * sequelize đọc DATETIME theo timezone '+00:00' nhưng escape tham số Date trong
 * raw query theo giờ local của process — round-trip Date bị lệch múi giờ nên
 * WHERE ModifiedAt = ? không bao giờ khớp. Chuỗi đi qua driver nguyên vẹn.
 */
function toDbWallTime(value) {
  const iso = value instanceof Date ? value.toISOString() : String(value ?? "");
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]} ${m[2]}` : null;
}

/**
 * Ghi watermark sau khi Firestore đã nhận batch — best-effort, lỗi không được làm
 * fail worker (job đã ack; thiếu watermark chỉ khiến reconcile sync lại lần nữa).
 * `ModifiedAt = ModifiedAt` chặn ON UPDATE CURRENT_TIMESTAMP tự đẩy ModifiedAt.
 * @param {Array<{ action: string, scenarioId?: string, modifiedAt?: string }>} items
 */
async function markScenariosSynced(items = []) {
  for (const item of items) {
    if (item?.action !== scenarioSyncQueue.ACTIONS.SYNC_FIRESTORE || !item.scenarioId) continue;
    try {
      const snapshot = toDbWallTime(item.modifiedAt);
      if (snapshot) {
        await sequelize.query(
          "UPDATE Scenarios SET SyncedAt = ?, ModifiedAt = ModifiedAt WHERE Id = ? AND ModifiedAt = ?",
          { replacements: [snapshot, item.scenarioId, snapshot], type: QueryTypes.UPDATE }
        );
      } else {
        // Job format cũ (không kèm modifiedAt) — mark theo giờ DB. Chấp nhận race hiếm
        // trong giai đoạn chuyển tiếp; reconcile vẫn là lưới đỡ cuối.
        await sequelize.query(
          "UPDATE Scenarios SET SyncedAt = NOW(), ModifiedAt = ModifiedAt WHERE Id = ?",
          { replacements: [item.scenarioId], type: QueryTypes.UPDATE }
        );
      }
    } catch (err) {
      logWarn("[sync-watermark] ghi SyncedAt thất bại — reconcile sẽ sync bù", {
        scenarioId: item.scenarioId,
        message: err.message || String(err),
      });
    }
  }
}

/**
 * Re-enqueue các scenario có content MySQL mới hơn Firestore.
 * Bỏ qua dòng Content rỗng/NULL (bản ghi legacy chỉ có dữ liệu trên Firestore —
 * sync "[]" lên sẽ xóa nhầm content legacy). Content "[]" hợp lệ vẫn được sync
 * (user chủ động xóa hết block).
 * @returns {Promise<Array<{ scenarioId: string, outcome: string, error?: string }>>}
 */
async function reconcileUnsyncedScenarios(maxItems = RECONCILE_BATCH) {
  if (!isFirebaseReady()) return []; // Firebase tắt → không có đích sync
  if (await scenarioSyncStatus.isFirestoreCircuitOpen()) return []; // đợi circuit đóng

  const limit = Math.max(1, Math.min(50, Number(maxItems) || RECONCILE_BATCH));
  const rows = await sequelize.query(
    `SELECT Id, Content, ModifiedAt FROM Scenarios
     WHERE (SyncedAt IS NULL OR SyncedAt < ModifiedAt)
       AND Content IS NOT NULL AND Content <> ''
       AND ModifiedAt < (NOW() - INTERVAL ${RECONCILE_GRACE_SEC} SECOND)
     ORDER BY ModifiedAt ASC
     LIMIT ${limit}`,
    { type: QueryTypes.SELECT }
  );
  if (!rows.length) return [];

  const results = [];
  for (const row of rows) {
    try {
      let content = [];
      try {
        const parsed = JSON.parse(row.Content);
        if (Array.isArray(parsed)) content = parsed;
      } catch {
        // Content hỏng — vẫn sync mảng rỗng? Không: bỏ qua để không phá Firestore.
        results.push({ scenarioId: row.Id, outcome: "skipped_invalid_content" });
        continue;
      }
      await scenarioSyncQueue.enqueueSync(row.Id, content, row.ModifiedAt);
      results.push({ scenarioId: row.Id, outcome: "requeued" });
    } catch (err) {
      results.push({
        scenarioId: row.Id,
        outcome: "error",
        error: err.message || String(err),
      });
    }
  }
  logInfo("[sync-watermark] reconcile re-enqueue scenario chưa sync", {
    requeued: results.filter((r) => r.outcome === "requeued").length,
    total: results.length,
  });
  return results;
}

module.exports = {
  markScenariosSynced,
  reconcileUnsyncedScenarios,
  toDbWallTime,
  RECONCILE_GRACE_SEC,
  RECONCILE_BATCH,
};
