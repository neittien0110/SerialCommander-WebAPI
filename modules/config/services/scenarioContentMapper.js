/**
 * Helpers gắn Content và syncStatus vào bản ghi Scenario trước khi trả về cho client.
 *
 * Ưu tiên đọc Content: MySQL trước (source of truth — mọi đường save đều ghi MySQL
 * đồng bộ trong transaction nên luôn mới nhất), Firestore chỉ là fallback cho bản ghi
 * legacy có cột Content rỗng. Trước đây đọc Firestore-first khiến block edit "biến mất"
 * khi job đồng bộ nền bị rớt (Firestore cũ đè MySQL mới).
 */
const scenarioFirestore = require("./scenarioFirestoreService");
const scenarioSyncStatus = require("../../../kernels/scenarioSyncStatus");

function toPlainRecord(record) {
  if (!record) return null;
  return record.dataValues ? { ...record.dataValues } : { ...record };
}

/**
 * MySQL có Content chưa? Chuỗi "[]" vẫn tính là CÓ — user xóa hết block là trạng thái
 * hợp lệ, không được để Firestore cũ "hồi sinh" block đã xóa.
 */
function hasStoredMysqlContent(out) {
  return typeof out?.Content === "string" && out.Content !== "";
}

/**
 * Gắn Content: giữ bản MySQL nếu có, ngược lại dùng Firestore (legacy) hoặc mảng rỗng.
 */
function applyScenarioContent(out, fromFs) {
  if (hasStoredMysqlContent(out)) return out;
  out.Content = fromFs != null ? JSON.stringify(fromFs) : JSON.stringify([]);
  return out;
}

async function attachScenarioContent(record) {
  const out = toPlainRecord(record);
  if (!out) return null;
  // Chỉ round-trip Firestore khi MySQL không có dữ liệu (bản ghi legacy).
  const fromFs = hasStoredMysqlContent(out)
    ? null
    : await scenarioFirestore.getScenarioContentArray(out.Id);
  applyScenarioContent(out, fromFs);
  const syncSt = await scenarioSyncStatus.getScenarioSyncStatus(out.Id);
  if (syncSt) out.syncStatus = syncSt;
  return out;
}

function attachScenarioContentFromMap(record, contentMap) {
  const out = toPlainRecord(record);
  if (!out) return null;
  const fromFs = contentMap.has(out.Id) ? contentMap.get(out.Id) : null;
  return applyScenarioContent(out, fromFs);
}

function applySyncStatus(out, statusMap) {
  if (!out?.Id || !statusMap) return out;
  const st = statusMap.get(out.Id);
  if (st) out.syncStatus = st;
  return out;
}

module.exports = {
  toPlainRecord,
  hasStoredMysqlContent,
  applyScenarioContent,
  attachScenarioContent,
  attachScenarioContentFromMap,
  applySyncStatus,
};
