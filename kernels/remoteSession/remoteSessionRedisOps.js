const { logWarn } = require("../logging/appLogger");
const { getSessionClient } = require("../redis/redisClients");
const { DEFAULT_TTL_SECONDS } = require("./remoteSessionMemoryStore");

/**
 * Lua script: atomic add stationId→userId vào stationMap.
 * Tránh race condition GET+SET khi nhiều station join đồng thời.
 * Returns: 0 nếu session không tồn tại, 1 nếu thành công.
 */
const LUA_ADD_STATION_MAPPING = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local data = cjson.decode(raw)
if not data.stationMap then data.stationMap = {} end
data.stationMap[ARGV[1]] = ARGV[2]
local ttl = redis.call('TTL', KEYS[1])
if ttl <= 0 then ttl = tonumber(ARGV[3]) end
redis.call('SET', KEYS[1], cjson.encode(data), 'EX', ttl)
return 1
`;

/**
 * Lua script: Compare-And-Swap cho updateSession.
 * So sánh raw JSON hiện tại với expected — nếu khớp thì SET new value.
 * Prevents GET-SET race condition khi nhiều request đồng thời cập nhật session.
 *
 * Returns:
 *   1  = swap thành công
 *   0  = key không tồn tại
 *  -1  = giá trị đã bị thay đổi (retry)
 */
const LUA_COMPARE_AND_SWAP = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
if current ~= ARGV[1] then return -1 end
local ttl = redis.call('TTL', KEYS[1])
if ttl <= 0 then ttl = tonumber(ARGV[3]) end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ttl)
return 1
`;

/**
 * Lua script: atomic thêm userId vào blockedUsers array.
 * Idempotent — không thêm trùng.
 * Returns: 0 không tìm thấy session, 1 blocked, 2 đã blocked rồi.
 */
const LUA_BLOCK_USER = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local data = cjson.decode(raw)
if not data.blockedUsers then data.blockedUsers = {} end
local uid = ARGV[1]
for _, v in ipairs(data.blockedUsers) do
  if v == uid then return 2 end
end
table.insert(data.blockedUsers, uid)
local ttl = redis.call('TTL', KEYS[1])
if ttl <= 0 then ttl = tonumber(ARGV[2]) end
redis.call('SET', KEYS[1], cjson.encode(data), 'EX', ttl)
return 1
`;

// Redis Set key theo dõi tất cả active session IDs.
// Thay thế SCAN "remote:session:*" (O(M keyspace)) bằng SMEMBERS O(N sessions).
const SESSIONS_SET_KEY = "remote:sessions";

const CAS_MAX_RETRIES = 3;

function getRedisClient() {
  return getSessionClient();
}

/**
 * Redis CAS update cho một session key.
 * Atomicity: GET current raw → run updater(JS) → Lua kiểm tra current == expected
 * rồi mới SET. Nếu writer khác chen vào, Lua trả -1 và retry tối đa CAS_MAX_RETRIES lần.
 *
 * Returns:
 *   true  = swap thành công
 *   false = key không tồn tại trong Redis (caller có thể thử fallback khác)
 *   undefined = tất cả client.eval đều lỗi/exhausted retries (caller thử fallback)
 */
async function casUpdateSession(client, sessionId, updater) {
  const key = `remote:session:${sessionId}`;
  for (let attempt = 0; attempt < CAS_MAX_RETRIES; attempt++) {
    try {
      if (client.status !== "ready") await client.connect();
      const raw = await client.get(key);
      if (!raw) return undefined; // key not in Redis; try in-memory fallback
      const data = JSON.parse(raw);
      const updated = updater(data);
      const ttl = await client.ttl(key);
      const effectiveTtl = Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TTL_SECONDS;
      const newRaw = JSON.stringify(updated);
      const result = await client.eval(
        LUA_COMPARE_AND_SWAP, 1, key, raw, newRaw, String(effectiveTtl)
      );
      if (result === 1) return true;
      if (result === 0) return false; // key đã bị xóa
      // result === -1: concurrent writer đã đổi value, retry
    } catch (err) {
      logWarn("[remote-session] Redis CAS updateSession failed", {
        message: err.message,
        attempt,
      });
      return undefined;
    }
  }
  logWarn("[remote-session] updateSession: all CAS retries exhausted", { sessionId });
  return undefined;
}

async function redisAddStationMapping(client, sessionId, stationId, userId, ttl) {
  try {
    if (client.status !== "ready") await client.connect();
    const result = await client.eval(
      LUA_ADD_STATION_MAPPING,
      1,
      `remote:session:${sessionId}`,
      String(stationId),
      String(userId),
      String(ttl)
    );
    return result; // 0 = session không tồn tại, 1 = thành công
  } catch (err) {
    logWarn("[remote-session] Redis eval LUA_ADD_STATION_MAPPING failed", { message: err.message });
    return undefined;
  }
}

async function redisBlockUser(client, sessionId, userId, ttl) {
  try {
    if (client.status !== "ready") await client.connect();
    const result = await client.eval(
      LUA_BLOCK_USER,
      1,
      `remote:session:${sessionId}`,
      String(userId),
      String(ttl)
    );
    return result; // 0 = session không tồn tại, 1 = blocked, 2 = đã blocked rồi
  } catch (err) {
    logWarn("[remote-session] Redis eval LUA_BLOCK_USER failed", { message: err.message });
    return undefined;
  }
}

module.exports = {
  SESSIONS_SET_KEY,
  getRedisClient,
  casUpdateSession,
  redisAddStationMapping,
  redisBlockUser,
};
