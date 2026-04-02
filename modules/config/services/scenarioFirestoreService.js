const { getFirestore, getAdmin, isFirebaseReady } = require("../../../kernels/firebaseAdmin");
const firebaseStorageService = require("./firebaseStorageService");

const COLLECTION =
  process.env.FIREBASE_SCENARIOS_COLLECTION || "scenarios";

function assertFirestore() {
  if (!isFirebaseReady()) {
    const err = new Error(
      "Firestore chưa sẵn sàng. Đặt FIREBASE_SERVICE_ACCOUNT_PATH trong .env trỏ tới file serviceAccountKey.json."
    );
    err.statusCode = 503;
    throw err;
  }
}

/**
 * Lưu mảng lệnh kịch bản (JSON) vào Firestore. Document id = Scenario.Id (UUID).
 * @param {string} scenarioId
 * @param {Array} contentArray
 */
exports.saveScenarioContent = async (scenarioId, contentArray) => {
  assertFirestore();
  const db = getFirestore();
  const admin = getAdmin();
  await db.collection(COLLECTION).doc(scenarioId).set({
    content: Array.isArray(contentArray) ? contentArray : [],
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await firebaseStorageService.saveScenarioJsonSnapshot(
    scenarioId,
    Array.isArray(contentArray) ? contentArray : []
  );
};

/**
 * Đọc mảng nội dung kịch bản từ Firestore.
 * @returns {Promise<Array|null>} null nếu không có document hoặc Firebase tắt.
 */
exports.getScenarioContentArray = async (scenarioId) => {
  const db = getFirestore();
  if (!db) {
    return null;
  }
  const snap = await db.collection(COLLECTION).doc(scenarioId).get();
  if (!snap.exists) {
    return null;
  }
  const data = snap.data();
  if (Array.isArray(data.content)) {
    return data.content;
  }
  if (Array.isArray(data.Content)) {
    return data.Content;
  }
  return null;
};

/**
 * Xóa document kịch bản trên Firestore (best-effort nếu Firebase tắt).
 */
exports.deleteScenarioContent = async (scenarioId) => {
  const db = getFirestore();
  if (!db) {
    return;
  }
  try {
    await db.collection(COLLECTION).doc(scenarioId).delete();
  } catch (e) {
    console.error("[firebase] Xóa scenario Firestore thất bại:", scenarioId, e.message);
  }
  await firebaseStorageService.deleteScenarioJsonSnapshot(scenarioId);
};

exports.getScenariosCollectionName = () => COLLECTION;
