const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

let initialized = false;

function resolveServiceAccountPath() {
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!keyPath || typeof keyPath !== "string" || keyPath.trim() === "") {
    return null;
  }
  const trimmed = keyPath.trim();
  return path.isAbsolute(trimmed) ? trimmed : path.join(process.cwd(), trimmed);
}

/**
 * Khởi tạo Firebase Admin (Firestore + Storage bucket) một lần.
 * Storage dùng sau này (ảnh, firmware); Firestore dùng cho JSON kịch bản.
 */
function ensureInitialized() {
  if (initialized) {
    return true;
  }
  const resolved = resolveServiceAccountPath();
  if (!resolved || !fs.existsSync(resolved)) {
    return false;
  }
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(resolved, "utf8"));
    const projectId = serviceAccount.project_id;
    const bucket =
      process.env.FIREBASE_STORAGE_BUCKET ||
      (projectId ? `${projectId}.firebasestorage.app` : undefined);

    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        ...(bucket ? { storageBucket: bucket } : {}),
      });
    }
    initialized = true;
    return true;
  } catch (e) {
    console.error("[firebase] Không khởi tạo được Firebase Admin:", e.message);
    return false;
  }
}

function isFirebaseReady() {
  return ensureInitialized();
}

function getFirestore() {
  return ensureInitialized() ? admin.firestore() : null;
}

function getStorageBucket() {
  if (!ensureInitialized()) {
    return null;
  }
  return admin.storage().bucket();
}

function getAdmin() {
  return ensureInitialized() ? admin : null;
}

module.exports = {
  isFirebaseReady,
  getFirestore,
  getStorageBucket,
  getAdmin,
};
