const { logWarn } = require("../logging/appLogger");
const { isProductionEnv } = require("./remoteSessionMemoryStore");

/**
 * MySQL fallback queries cho remote session — dùng khi Redis không khả dụng.
 * `sequelize`/`QueryTypes` được require() lazily bên trong từng hàm để tránh
 * circular dependency với models (giữ nguyên pattern gốc).
 */

async function dbSaveSession(sessionId, payload, ttl) {
  const { sequelize } = require("../../models");
  const expiresAt = new Date(Date.now() + ttl * 1000);
  await sequelize.query(
    `INSERT INTO remote_sessions (session_id, user_id, mqtt_password_token, join_challenge, expires_at)
     VALUES (:sessionId, :userId, :mqttPasswordToken, :joinChallenge, :expiresAt)
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       mqtt_password_token = VALUES(mqtt_password_token),
       join_challenge = VALUES(join_challenge),
       expires_at = VALUES(expires_at)`,
    {
      replacements: {
        sessionId,
        userId: payload.userId,
        mqttPasswordToken: payload.mqttPasswordToken,
        joinChallenge: payload.joinChallenge || null,
        expiresAt,
      },
    }
  );
}

async function dbGetSession(sessionId) {
  try {
    const { sequelize } = require("../../models");
    const { QueryTypes } = require("sequelize");
    const rows = await sequelize.query(
      `SELECT user_id AS userId, mqtt_password_token AS mqttPasswordToken,
              join_challenge AS joinChallenge
       FROM remote_sessions
       WHERE session_id = :sessionId AND expires_at > UTC_TIMESTAMP()
       LIMIT 1`,
      { replacements: { sessionId }, type: QueryTypes.SELECT }
    );
    if (rows && rows[0]) {
      if (isProductionEnv()) {
        logWarn("[remote-session] CRITICAL DEGRADE: Using MySQL fallback for session GET. envelopeToken is lost and defaults to mqttPasswordToken.", { sessionId });
      }
      return rows[0];
    }
  } catch {
    /* table may not exist in dev */
  }
  return null;
}

async function dbGetActiveSessionIds() {
  try {
    const { sequelize } = require("../../models");
    const { QueryTypes } = require("sequelize");
    const rows = await sequelize.query(
      `SELECT session_id AS sessionId
       FROM remote_sessions
       WHERE expires_at > UTC_TIMESTAMP()`,
      { type: QueryTypes.SELECT }
    );
    if (rows && rows.length > 0) return rows.map((r) => r.sessionId);
  } catch {
    /* table may not exist in dev */
  }
  return [];
}

async function dbDeleteSession(sessionId) {
  try {
    const { sequelize } = require("../../models");
    await sequelize.query(
      `DELETE FROM remote_sessions WHERE session_id = :sessionId`,
      { replacements: { sessionId } }
    );
  } catch {
    /* table may not exist in dev */
  }
}

module.exports = {
  dbSaveSession,
  dbGetSession,
  dbGetActiveSessionIds,
  dbDeleteSession,
};
