/**
 * Đồng bộ sessionId + mqttPasswordToken vào Mosquitto password_file.
 * Khớp MqttContext: username=sessionId, password=mqttPasswordToken (plain, broker hash bằng PBKDF2).
 *
 * Orchestrator: kết hợp passwdFileIO.js (đọc/ghi/parse passwd file native), mosquittoReload.js
 * (execFile docker/CLI + debounce HUP) để cung cấp API ổn định cho phần còn lại của app.
 *
 * Lưu ý: MQTT_PASSWD_FILE nên là đường dẫn tương đối WebAPI root — resolve theo __dirname, không theo cwd.
 */
const fs = require("fs");
const path = require("path");
const { logInfo, logWarn } = require("../logging/appLogger");
const {
  WEBAPI_ROOT,
  passwdFilePath,
  writePasswdEntryNative,
  removePasswdEntryNative,
  passwdFileHasUser,
  enqueueWrite,
} = require("./passwdFileIO");
const {
  isDockerCliEnabled,
  reloadMqttBrokerInDocker,
  passwdVisibleInBrokerContainer,
  upsertViaDockerExecPasswd,
  upsertViaDockerPasswd,
  upsertViaNativePasswd,
  removeViaDockerPasswd,
  removeViaNativePasswd,
  scheduleHupOnce,
  _resetHupStateForTests,
  _getHupDebounceMs,
} = require("./mosquittoReload");

const SESSION_ID_PATTERN = /^[a-f0-9]{16}$/;

/**
 * Thực hiện ghi user vào passwd file (không có serialization — gọi qua enqueueWrite).
 *
 * Thứ tự ưu tiên (MQTT_DOCKER_CLI_ENABLED):
 *   1. docker exec mosquitto_passwd (cùng image broker)
 *   2. docker run mosquitto_passwd
 *   3. host CLI → native PBKDF2
 * Không bật Docker CLI: host CLI → native PBKDF2
 *
 * @returns {Promise<{ synced?: boolean, skipped?: boolean, reason?: string, error?: string }>}
 */
async function _doUpsertMqttBrokerUser(sessionId, mqttPasswordToken) {
  const file = passwdFilePath();
  if (!file) return { skipped: true, reason: "MQTT_PASSWD_FILE không cấu hình" };

  const dir = path.dirname(file);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    logWarn("[mosquitto-passwd] không mkdir được", { dir, message: err.message });
    return { skipped: true, reason: "mkdir_failed", error: err.message };
  }

  const createNew = !fs.existsSync(file);

  const tryDockerRunPasswd = async (cause) => {
    try {
      await upsertViaDockerPasswd(file, sessionId, mqttPasswordToken, createNew);
      logInfo("[mosquitto-passwd] đã ghi user phiên (docker run mosquitto_passwd)", { sessionId });
      return { synced: true, viaDocker: true, needsReload: true };
    } catch (dockerErr) {
      logWarn("[mosquitto-passwd] docker run mosquitto_passwd thất bại", {
        sessionId,
        cause,
        message: dockerErr.message,
        file,
      });
      return null;
    }
  };

  if (isDockerCliEnabled()) {
    try {
      await upsertViaDockerExecPasswd(sessionId, mqttPasswordToken);
      if (await passwdVisibleInBrokerContainer(sessionId)) {
        return { synced: true, needsReload: true, viaDockerExec: true };
      }
      logWarn("[mosquitto-passwd] docker exec xong nhưng broker chưa thấy user — ghi lại", {
        sessionId,
      });
      await upsertViaDockerExecPasswd(sessionId, mqttPasswordToken);
      if (await passwdVisibleInBrokerContainer(sessionId)) {
        return { synced: true, needsReload: true, viaDockerExec: true, retried: true };
      }
    } catch (execErr) {
      logWarn("[mosquitto-passwd] docker exec mosquitto_passwd thất bại — thử docker run", {
        sessionId,
        message: execErr.message || String(execErr),
      });
    }
    const dockerRunResult = await tryDockerRunPasswd("exec_failed");
    if (dockerRunResult) {
      if (!(await passwdVisibleInBrokerContainer(sessionId))) {
        try {
          await upsertViaDockerExecPasswd(sessionId, mqttPasswordToken);
        } catch (retryErr) {
          logWarn("[mosquitto-passwd] docker run xong nhưng container vẫn thiếu user", {
            sessionId,
            message: retryErr.message || String(retryErr),
          });
        }
      }
      return dockerRunResult;
    }
  } else {
    try {
      await upsertViaNativePasswd(file, sessionId, mqttPasswordToken, createNew);
      logInfo("[mosquitto-passwd] đã ghi user phiên (host mosquitto_passwd)", { sessionId });
      return { synced: true, needsReload: true };
    } catch (cliErr) {
      logWarn("[mosquitto-passwd] host mosquitto_passwd thất bại", {
        sessionId,
        message: cliErr.message || String(cliErr),
      });
    }
  }

  // ── Fallback: native PBKDF2 (một số broker từ chối — chỉ dùng khi không có CLI) ──
  try {
    writePasswdEntryNative(file, sessionId, mqttPasswordToken, createNew);
    if (isDockerCliEnabled()) {
      try {
        await upsertViaDockerExecPasswd(sessionId, mqttPasswordToken);
      } catch (syncErr) {
        logWarn("[mosquitto-passwd] native ghi host OK nhưng docker exec đồng bộ thất bại", {
          sessionId,
          message: syncErr.message || String(syncErr),
        });
      }
    }
    logWarn(
      "[mosquitto-passwd] đã ghi user phiên (native PBKDF2 fallback) — cài mosquitto_passwd hoặc bật MQTT_DOCKER_CLI_ENABLED",
      { sessionId }
    );
    return { synced: true, needsReload: true, viaNativeFallback: true };
  } catch (nativeErr) {
    logWarn("[mosquitto-passwd] mọi phương thức ghi passwd đều thất bại", {
      sessionId,
      message: nativeErr.message || String(nativeErr),
    });
    return { skipped: true, reason: "all_methods_failed", error: nativeErr.message };
  }
}

/**
 * Ghi user vào Mosquitto passwd file theo hàng đợi tuần tự để tránh race condition.
 * Sau khi ghi xong, gửi HUP và đợi Mosquitto reload trước khi return.
 *
 * @param {string} sessionId 16 hex — username broker
 * @param {string} mqttPasswordToken mật khẩu broker (plain — giống lúc CONNECT)
 * @returns {Promise<{ synced?: boolean, skipped?: boolean, reason?: string, error?: string }>}
 */

/**
 * Station verify: luôn upsert passwd để đồng bộ token Redis ↔ broker (sửa hash stale).
 * HUP được debounce — nhiều join đồng thời chỉ reload broker một lần.
 */
async function ensureMqttBrokerUser(sessionId, mqttPasswordToken) {
  const alreadyPresent = passwdFileHasUser(sessionId);
  const result = await upsertMqttBrokerUser(sessionId, mqttPasswordToken);
  return {
    ...result,
    alreadyPresent,
    passwdReloaded: result.needsReload === true,
    // Passwd ghi được nhưng broker KHÔNG reload → client sẽ bị CONNACK denied.
    reloadFailed: result.needsReload === true && result.reloadOk === false,
  };
}

async function upsertMqttBrokerUser(sessionId, mqttPasswordToken) {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    logWarn("[mosquitto-passwd] sessionId không hợp lệ", { sessionId });
    return { skipped: true, reason: "invalid_session_id" };
  }
  if (!mqttPasswordToken || typeof mqttPasswordToken !== "string") {
    return { skipped: true, reason: "missing_password" };
  }

  // Serialise writes: tránh hai tiến trình mosquitto_passwd ghi đồng thời làm hỏng file.
  const result = await enqueueWrite(() => _doUpsertMqttBrokerUser(sessionId, mqttPasswordToken));

  if (result.needsReload) {
    // Dùng debounced HUP: nhiều phiên tạo đồng thời chia sẻ 1 HUP duy nhất.
    // Thay vì N×1200ms, tất cả hoàn tất sau ~(HUP_DEBOUNCE_MS + MOSQUITTO_RELOAD_DELAY_MS).
    const reloaded = await scheduleHupOnce();
    // reloadOk=false CHỈ khi reload chắc chắn thất bại (false tường minh) — undefined
    // từ bản cũ/mock được coi là ok để không báo động giả.
    return { ...result, reloadOk: reloaded !== false };
  }

  return result;
}

/**
 * Thu hồi credential broker NGAY khi host kết thúc phiên:
 * xóa user khỏi passwd file (serialize qua enqueueWrite) rồi HUP Mosquitto.
 * Sau HUP, client mới không thể CONNECT bằng credential phiên cũ.
 * Idempotent — user không có trong file vẫn trả removed=true.
 */
async function removeMqttBrokerUser(sessionId) {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return { skipped: true, reason: "invalid_session_id" };
  }
  const file = passwdFilePath();
  if (!file) return { skipped: true, reason: "MQTT_PASSWD_FILE không cấu hình" };

  const removed = await enqueueWrite(async () => {
    if (!passwdFileHasUser(sessionId)) return true;
    try {
      removePasswdEntryNative(file, sessionId);
      return true;
    } catch {
      try {
        await removeViaNativePasswd(file, sessionId);
        return true;
      } catch {
        try {
          await removeViaDockerPasswd(file, sessionId);
          return true;
        } catch (dockerErr) {
          logWarn("[mosquitto-passwd] Thu hồi user phiên thất bại (native + CLI + docker)", {
            sessionId,
            message: dockerErr.message,
          });
          return false;
        }
      }
    }
  });

  if (!removed) return { removed: false };
  await scheduleHupOnce();
  logInfo("[mosquitto-passwd] đã thu hồi user phiên + HUP broker", { sessionId });
  return { removed: true };
}

/**
 * Parses the mosquitto passwd file and removes usernames (sessionIds) that no longer exist in Redis.
 * Runs periodically to clean up the file and prevent hackers from reusing old sessions.
 */
async function cleanupExpiredUsers(getActiveSessionIdsFn) {
  const file = passwdFilePath();
  if (!file || !fs.existsSync(file)) return { skipped: true, reason: "MQTT_PASSWD_FILE không tồn tại hoặc không được cấu hình" };

  try {
    const fileContent = fs.readFileSync(file, 'utf8');
    const lines = fileContent.split('\n');
    const userIdsInFile = lines
      .map(line => line.split(':')[0])
      .filter(user => SESSION_ID_PATTERN.test(user)); // only consider actual session IDs

    if (userIdsInFile.length === 0) return { skipped: true, reason: "Không có session ID nào trong file" };

    const activeSessionIds = await getActiveSessionIdsFn();
    const activeSet = new Set(activeSessionIds);
    let removedCount = 0;

    for (const sessionId of userIdsInFile) {
      if (!activeSet.has(sessionId)) {
        // Serialize qua enqueueWrite để không xung đột với upsertMqttBrokerUser đang chạy.
        const removed = await enqueueWrite(async () => {
          // Thử native trước (không subprocess), rồi CLI, rồi Docker
          try {
            removePasswdEntryNative(file, sessionId);
            return true;
          } catch {
            try {
              await removeViaNativePasswd(file, sessionId);
              return true;
            } catch {
              try {
                await removeViaDockerPasswd(file, sessionId);
                return true;
              } catch (dockerErr) {
                logWarn("[mosquitto-passwd] Xóa user thất bại (native + CLI + docker)", { sessionId, message: dockerErr.message });
                return false;
              }
            }
          }
        });
        if (removed) removedCount++;
      }
    }

    if (removedCount > 0) {
      logInfo("[mosquitto-passwd] Đã xóa user phiên hết hạn", { count: removedCount });
      await reloadMqttBrokerInDocker();
    }

    return { success: true, removedCount };
  } catch (err) {
    logWarn("[mosquitto-passwd] Lỗi trong quá trình dọn dẹp passwd file", { message: err.message });
    return { skipped: true, reason: "error", error: err.message };
  }
}

module.exports = {
  passwdFilePath,
  passwdFileHasUser,
  upsertMqttBrokerUser,
  ensureMqttBrokerUser,
  removeMqttBrokerUser,
  cleanupExpiredUsers,
  WEBAPI_ROOT_FOR_TESTS: WEBAPI_ROOT,
  _resetHupStateForTests,
  _getHupDebounceMs,
};
