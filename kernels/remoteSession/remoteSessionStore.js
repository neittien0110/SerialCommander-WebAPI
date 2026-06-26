const { logWarn } = require("../logging/appLogger");
const {
  isProductionEnv,
  throwIfProductionMemoryFallback,
  ttlSeconds,
  memoryKey,
  pruneMemoryStore,
  MEMORY_STORE,
} = require("./remoteSessionMemoryStore");
const {
  SESSIONS_SET_KEY,
  getRedisClient,
  casUpdateSession,
  redisAddStationMapping,
  redisBlockUser,
} = require("./remoteSessionRedisOps");
const {
  dbSaveSession,
  dbGetSession,
  dbGetActiveSessionIds,
  dbDeleteSession,
} = require("./remoteSessionDbFallback");
const { timingSafeEqualString, verifyJoinChallenge } = require("./remoteSessionCrypto");

async function saveSession(sessionId, payload) {
  const ttl = ttlSeconds();
  const body = JSON.stringify(payload);
  const client = getRedisClient();
  if (client) {
    try {
      if (client.status !== "ready") await client.connect();
      await client.set(`remote:session:${sessionId}`, body, "EX", ttl);
      client.sadd(SESSIONS_SET_KEY, sessionId).catch(() => {});
      if (isProductionEnv()) return { ttlSeconds: ttl };
      // Non-production: fall through to also write MEMORY_STORE so updateSession works.
    } catch (err) {
      logWarn("[remote-session] Redis SET failed, trying fallback", { message: err.message });
    }
  }

  try {
    await dbSaveSession(sessionId, payload, ttl);
    if (isProductionEnv()) return { ttlSeconds: ttl };
    // Non-production: fall through to MEMORY_STORE so updateSession (stationMap, blockedUsers) works.
  } catch (err) {
    logWarn("[remote-session] MySQL fallback failed, using in-memory", {
      message: err.message || String(err),
    });
    throwIfProductionMemoryFallback("saveSession after Redis/MySQL failure", err);
  }

  pruneMemoryStore();
  MEMORY_STORE.set(memoryKey(sessionId), {
    payload,
    expiresAtMs: Date.now() + ttl * 1000,
  });
  return { ttlSeconds: ttl };
}

async function getSession(sessionId) {
  const client = getRedisClient();
  if (client) {
    try {
      if (client.status !== "ready") await client.connect();
      const raw = await client.get(`remote:session:${sessionId}`);
      if (raw) return JSON.parse(raw);
    } catch (err) {
      logWarn("[remote-session] Redis GET failed", { message: err.message });
    }
  }

  const mysqlRow = await dbGetSession(sessionId);
  if (mysqlRow && isProductionEnv()) return mysqlRow;

  if (!isProductionEnv()) {
    pruneMemoryStore();
    const entry = MEMORY_STORE.get(memoryKey(sessionId));
    if (entry && entry.expiresAtMs > Date.now()) return entry.payload;
    return mysqlRow; // MEMORY_STORE empty: fall back to MySQL partial data
  }
  return null;
}

async function verifySessionCredentials(sessionId, mqttPasswordToken) {
  const record = await getSession(sessionId);
  if (!record || !record.mqttPasswordToken) return false;
  return timingSafeEqualString(record.mqttPasswordToken, mqttPasswordToken);
}

async function getActiveSessionIds() {
  const client = getRedisClient();
  if (client) {
    try {
      if (client.status !== "ready") await client.connect();

      // SMEMBERS O(N sessions) thay vì SCAN O(M keyspace toàn bộ Redis).
      const members = await client.smembers(SESSIONS_SET_KEY);
      if (!members.length) return [];

      // MGET một round-trip để lọc session đã hết TTL (stale Set member).
      const sessionKeys = members.map((id) => `remote:session:${id}`);
      const values = await client.mget(...sessionKeys);

      const active = [];
      const stale = [];
      members.forEach((id, i) => {
        if (values[i] !== null) active.push(id);
        else stale.push(id);
      });

      // Dọn stale members fire-and-forget: không block caller nếu SREM lỗi.
      if (stale.length > 0) {
        client.srem(SESSIONS_SET_KEY, ...stale).catch(() => {});
      }

      return active;
    } catch (err) {
      logWarn("[remote-session] Redis SMEMBERS/MGET failed", { message: err.message });
    }
  }

  const dbSessionIds = await dbGetActiveSessionIds();
  if (dbSessionIds.length > 0) return dbSessionIds;

  if (!isProductionEnv()) {
    pruneMemoryStore();
    const sessionIds = [];
    for (const [key, entry] of MEMORY_STORE.entries()) {
      if (entry.expiresAtMs > Date.now()) {
        sessionIds.push(key.replace("remote:session:", ""));
      }
    }
    return sessionIds;
  }
  return [];
}

/**
 * Cập nhật một phần dữ liệu session (Redis CAS + in-memory fallback).
 * MySQL không hỗ trợ — stationMap/blockedUsers là dữ liệu ephemeral.
 *
 * Redis path dùng Compare-And-Swap Lua (xem remoteSessionRedisOps.casUpdateSession)
 * để tránh race condition GET-SET. Nếu CAS không áp dụng được (key không tồn tại
 * trong Redis hoặc retries exhausted), fallback sang in-memory ở non-production.
 */
async function updateSession(sessionId, updater) {
  const client = getRedisClient();
  if (client) {
    const result = await casUpdateSession(client, sessionId, updater);
    if (result === true) return true;
    if (result === false) return false;
    // result === undefined: retries exhausted hoặc lỗi — fall through to in-memory fallback in non-production.
  }
  if (isProductionEnv()) {
    return false;
  }
  // In-memory fallback chỉ dùng trong dev (single-threaded → không có race condition).
  pruneMemoryStore();
  const key = memoryKey(sessionId);
  const entry = MEMORY_STORE.get(key);
  if (!entry || entry.expiresAtMs <= Date.now()) return false;
  entry.payload = updater(entry.payload);
  return true;
}

/** Lưu mapping stationId → userId để host có thể kick đúng người. */
async function addStationMapping(sessionId, stationId, userId) {
  const client = getRedisClient();
  if (client) {
    const ttl = ttlSeconds();
    const result = await redisAddStationMapping(client, sessionId, stationId, userId, ttl);
    if (result !== 0 && result !== undefined) return true;
    // result=0 → session không tồn tại trong Redis, thử fallback
  }
  // Fallback: in-memory path (single-threaded, không có race condition)
  return updateSession(sessionId, (data) => ({
    ...data,
    stationMap: { ...(data.stationMap || {}), [stationId]: String(userId) },
  }));
}

/** Xóa mapping stationId sau kick — station có thể join lại với stationId mới. */
async function removeStationMapping(sessionId, stationId) {
  return updateSession(sessionId, (data) => {
    const map = data.stationMap;
    if (!map || !map[stationId]) return data;
    const next = { ...map };
    delete next[stationId];
    return { ...data, stationMap: next };
  });
}

/**
 * Kick station + rotate joinChallenge trong một CAS update.
 * Returns: { applied: boolean } — applied false nếu stationId không có trong map.
 */
async function kickAndRotateInvite(sessionId, stationId, newJoinChallenge) {
  let applied = false;
  const ok = await updateSession(sessionId, (data) => {
    const map = data.stationMap;
    if (!map || !map[stationId]) return data;
    applied = true;
    const next = { ...map };
    delete next[stationId];
    return { ...data, stationMap: next, joinChallenge: newJoinChallenge };
  });
  return applied && ok;
}

/** Block một userId — dự phòng ban thủ công; kick hiện không dùng. */
async function blockUser(sessionId, userId) {
  const client = getRedisClient();
  if (client) {
    const ttl = ttlSeconds();
    const result = await redisBlockUser(client, sessionId, userId, ttl);
    if (result !== 0 && result !== undefined) return true; // 1=blocked, 2=already blocked
    // result=0 → session không tồn tại, thử fallback
  }
  // Fallback: in-memory path
  return updateSession(sessionId, (data) => {
    const blocked = Array.isArray(data.blockedUsers) ? data.blockedUsers : [];
    const uid = String(userId);
    if (blocked.includes(uid)) return data;
    return { ...data, blockedUsers: [...blocked, uid] };
  });
}

/**
 * Xóa session ngay lập tức (host kết thúc phiên) — Redis + MySQL fallback + memory.
 * Idempotent: trả về true nếu có ít nhất một store thực sự xóa bản ghi.
 */
async function deleteSession(sessionId) {
  let deleted = false;
  const client = getRedisClient();
  if (client) {
    try {
      if (client.status !== "ready") await client.connect();
      const n = await client.del(`remote:session:${sessionId}`);
      if (n > 0) {
        deleted = true;
        client.srem(SESSIONS_SET_KEY, sessionId).catch(() => {});
      }
    } catch (err) {
      logWarn("[remote-session] Redis DEL failed", { message: err.message });
    }
  }

  await dbDeleteSession(sessionId);

  if (MEMORY_STORE.delete(memoryKey(sessionId))) deleted = true;
  return deleted;
}

async function isUserBlocked(sessionId, userId) {
  const record = await getSession(sessionId);
  if (!record || !Array.isArray(record.blockedUsers)) return false;
  return record.blockedUsers.includes(String(userId));
}

module.exports = {
  ttlSeconds,
  saveSession,
  getSession,
  deleteSession,
  updateSession,
  addStationMapping,
  removeStationMapping,
  kickAndRotateInvite,
  blockUser,
  isUserBlocked,
  verifySessionCredentials,
  verifyJoinChallenge,
  getActiveSessionIds,
  SESSIONS_SET_KEY,
};
