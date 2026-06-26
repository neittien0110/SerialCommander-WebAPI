const { logError } = require("../logging/appLogger");

/**
 * In-memory fallback store cho remote session — chỉ dùng khi cả Redis và
 * MySQL đều không khả dụng (chủ yếu trong dev/test). Bị khoá cứng ở production
 * qua throwIfProductionMemoryFallback().
 */
const DEFAULT_TTL_SECONDS = 2 * 60 * 60;
const MEMORY_STORE = new Map();

function isProductionEnv() {
  return process.env.NODE_ENV === "production";
}

function throwIfProductionMemoryFallback(operation, err) {
  if (!isProductionEnv()) return;
  const detail = err?.message || String(err || "unknown");
  const message = `[remote-session] CRITICAL: ${operation} — in-memory fallback disabled in production: ${detail}`;
  logError(message);
  throw new Error(message);
}

function ttlSeconds() {
  const raw = parseInt(process.env.REMOTE_SESSION_TTL_SECONDS || String(DEFAULT_TTL_SECONDS), 10);
  return Number.isFinite(raw) && raw > 60 ? raw : DEFAULT_TTL_SECONDS;
}

function memoryKey(sessionId) {
  return `remote:session:${sessionId}`;
}

function pruneMemoryStore() {
  const now = Date.now();
  for (const [key, entry] of MEMORY_STORE.entries()) {
    if (entry.expiresAtMs <= now) MEMORY_STORE.delete(key);
  }
}

module.exports = {
  DEFAULT_TTL_SECONDS,
  MEMORY_STORE,
  isProductionEnv,
  throwIfProductionMemoryFallback,
  ttlSeconds,
  memoryKey,
  pruneMemoryStore,
};
