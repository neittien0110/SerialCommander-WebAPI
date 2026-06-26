const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { logError } = require("./logging/appLogger");

let initialized = false;

function resolveServiceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || typeof raw !== "string" || !raw.trim()) return null;
  try {
    const decoded = Buffer.from(raw.trim(), "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    try {
      return JSON.parse(raw.trim());
    } catch {
      return null;
    }
  }
}

function resolveServiceAccountPath() {
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!keyPath || typeof keyPath !== "string" || keyPath.trim() === "") {
    return null;
  }
  const trimmed = keyPath.trim();
  return path.isAbsolute(trimmed) ? trimmed : path.join(process.cwd(), trimmed);
}

function ensureInitialized() {
  if (initialized) {
    return true;
  }
  let serviceAccount = resolveServiceAccountFromEnv();
  const resolved = resolveServiceAccountPath();
  if (!serviceAccount) {
    if (!resolved || !fs.existsSync(resolved)) {
      return false;
    }
    try {
      serviceAccount = JSON.parse(fs.readFileSync(resolved, "utf8"));
    } catch (e) {
      logError("[firebase] Không đọc được service account file:", { error: e.message });
      return false;
    }
  }
  try {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    initialized = true;
    return true;
  } catch (e) {
    logError("[firebase] Không khởi tạo được Firebase Admin:", { error: e.message });
    return false;
  }
}

function isFirebaseReady() {
  return ensureInitialized();
}

function getFirestore() {
  return ensureInitialized() ? admin.firestore() : null;
}

function getAdmin() {
  return ensureInitialized() ? admin : null;
}

module.exports = {
  isFirebaseReady,
  getFirestore,
  getAdmin,
};
