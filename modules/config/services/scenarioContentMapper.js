/**
 * Helpers gắn Content (Firestore) và syncStatus vào bản ghi Scenario (MySQL)
 * trước khi trả về cho client.
 */
const scenarioFirestore = require("./scenarioFirestoreService");
const scenarioSyncStatus = require("../../../kernels/scenarioSyncStatus");

function toPlainRecord(record) {
  if (!record) return null;
  return record.dataValues ? { ...record.dataValues } : { ...record };
}

/**
 * Gắn Content (chuỗi JSON mảng) từ Firestore hoặc giữ bản legacy trong MySQL.
 */
function applyScenarioContent(out, fromFs) {
  if (fromFs != null) {
    out.Content = JSON.stringify(fromFs);
  } else if (out.Content == null || out.Content === "") {
    out.Content = JSON.stringify([]);
  }
  return out;
}

async function attachScenarioContent(record) {
  const out = toPlainRecord(record);
  if (!out) return null;
  const fromFs = await scenarioFirestore.getScenarioContentArray(out.Id);
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
  applyScenarioContent,
  attachScenarioContent,
  attachScenarioContentFromMap,
  applySyncStatus,
};
