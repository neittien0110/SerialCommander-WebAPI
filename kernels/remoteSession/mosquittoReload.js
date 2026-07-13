/**
 * Process execution cho Mosquitto: docker exec/run mosquitto_passwd, host CLI mosquitto_passwd,
 * HUP/restart broker, debounce gom nhiều yêu cầu HUP trong cùng khoảng thời gian.
 *
 * Dev Docker: ghi passwd bằng `docker exec … mosquitto_passwd` trong container broker
 * (hash khớp eclipse-mosquitto:2). KHÔNG dùng mosquitto_passwd Homebrew trên host — hash lệch broker.
 * Fallback: docker run image, host CLI, native PBKDF2 (xem passwdFileIO.js).
 */
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { logInfo, logWarn, logError } = require("../logging/appLogger");
const { passwdFilePath } = require("./passwdFileIO");

const execFileAsync = promisify(execFile);

/** Delay dùng để đợi Mosquitto hoàn tất reload sau HUP. */
const MOSQUITTO_RELOAD_DELAY_MS = Number(process.env.MQTT_BROKER_RELOAD_DELAY_MS || 1200);

/**
 * Debounce window để gom nhiều yêu cầu HUP trong cùng khoảng thời gian.
 * N phiên tạo đồng thời → chỉ 1 HUP duy nhất thay vì N×1200ms.
 * Cấu hình qua MQTT_BROKER_HUP_DEBOUNCE_MS (default 200ms).
 */
const HUP_DEBOUNCE_MS = Number(process.env.MQTT_BROKER_HUP_DEBOUNCE_MS || 200);
let _hupDebounceTimer = null;
const _hupWaiters = [];

/**
 * Lên lịch HUP một lần duy nhất trong cửa sổ debounce.
 * Mọi caller trong cùng cửa sổ đều chờ cùng 1 HUP rồi mới return.
 * @returns {Promise<boolean>} true nếu broker ĐÃ reload thành công — false nghĩa là
 * credential mới có thể chưa được broker đọc (client sẽ bị CONNACK Not authorized).
 */
function scheduleHupOnce() {
  return new Promise((resolve) => {
    _hupWaiters.push(resolve);
    if (_hupDebounceTimer !== null) return; // đã có timer đang chạy, chỉ cần đăng ký waiter
    _hupDebounceTimer = setTimeout(async () => {
      _hupDebounceTimer = null;
      const waiters = _hupWaiters.splice(0);
      let reloaded = false;
      try {
        reloaded = (await reloadMqttBroker()) === true;
        await new Promise((r) => setTimeout(r, MOSQUITTO_RELOAD_DELAY_MS));
      } finally {
        for (const w of waiters) w(reloaded);
      }
    }, HUP_DEBOUNCE_MS);
  });
}

/** Test helper: reset trạng thái debounce giữa các test cases. */
function _resetHupStateForTests() {
  if (_hupDebounceTimer !== null) {
    clearTimeout(_hupDebounceTimer);
    _hupDebounceTimer = null;
  }
  _hupWaiters.splice(0);
}

/** Dev: Compose demo/full stack — HUP để broker đọc lại passwd (không HUP → CONNACK Not authorized). */
const DEFAULT_DEV_HUP_CONTAINERS = ["sc-mqtt-demo", "sc-mqtt"];
const DEFAULT_CONTAINER_PASSWD_PATH = "/mosquitto/config/passwd";

function isDockerCliEnabled() {
  return process.env.MQTT_DOCKER_CLI_ENABLED === "true";
}

function containerPasswdPath() {
  return (process.env.MQTT_PASSWD_CONTAINER_PATH || DEFAULT_CONTAINER_PASSWD_PATH).trim();
}

function dockerBrokerContainerCandidates() {
  const explicit = (
    process.env.MQTT_BROKER_HUP_CONTAINER ||
    process.env.MQTT_BROKER_RELOAD_CONTAINER ||
    ""
  ).trim();
  if (explicit) return [explicit];
  if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test") return [];
  return DEFAULT_DEV_HUP_CONTAINERS;
}

async function reloadMqttBrokerOnHost() {
  const cmd = (process.env.MQTT_BROKER_RELOAD_CMD || "").trim();
  if (!cmd) return false;
  try {
    await execFileAsync("bash", ["-lc", cmd], { timeout: 15000 });
    logInfo("[mosquitto-passwd] đã reload Mosquitto (host)", { cmd });
    return true;
  } catch (err) {
    // ERROR chứ không phải warn: reload fail nghĩa là mọi phiên MỚI sẽ bị broker
    // từ chối (CONNACK Not authorized) trong khi API vẫn cấp credentials.
    logError("[mosquitto-passwd] MQTT_BROKER_RELOAD_CMD thất bại", {
      cmd,
      message: err.message || String(err),
    });
    return false;
  }
}

/** @returns {Promise<boolean>} true nếu broker đã được reload thành công. */
async function reloadMqttBroker() {
  if (await reloadMqttBrokerOnHost()) return true;
  const dockerOk = await reloadMqttBrokerInDocker();
  if (!dockerOk) {
    const hostCmdConfigured = Boolean((process.env.MQTT_BROKER_RELOAD_CMD || "").trim());
    if (hostCmdConfigured || isDockerCliEnabled()) {
      logError(
        "[mosquitto-passwd] Broker KHÔNG reload được — user phiên mới có thể bị CONNACK Not authorized tới lần reload thành công kế tiếp."
      );
    }
  }
  return dockerOk;
}

/** @returns {Promise<boolean>} true nếu HUP hoặc restart container thành công. */
async function reloadMqttBrokerInDocker() {
  if (!isDockerCliEnabled()) {
    logWarn(
      "[mosquitto-passwd] MQTT_DOCKER_CLI_ENABLED≠true — bỏ qua docker HUP/restart (không mount docker.sock).",
      { code: "MQTT_DOCKER_CLI_DISABLED" }
    );
    return false;
  }

  const candidates = dockerBrokerContainerCandidates();
  if (!candidates.length) return false;

  for (const name of candidates) {
    try {
      await execFileAsync("docker", ["kill", "-s", "HUP", name], {
        timeout: 8000,
      });
      logInfo("[mosquitto-passwd] đã HUP Mosquitto (reload password_file)", { container: name });
      return true;
    } catch {
      /* thử container dev tiếp theo */
    }
  }

  for (const name of candidates) {
    try {
      await execFileAsync("docker", ["restart", name], { timeout: 25000 });
      logInfo("[mosquitto-passwd] đã restart Mosquitto (reload passwd)", { container: name });
      await new Promise((r) => setTimeout(r, 1500));
      return true;
    } catch {
      /* thử container tiếp */
    }
  }

  logWarn(
    "[mosquitto-passwd] không HUP/restart được container — broker có thể chưa đọc user mới (Not authorized).",
    { tried: candidates }
  );
  return false;
}

/**
 * Ghi passwd trong container broker đang chạy — hash khớp đúng phiên bản Mosquitto đang listen.
 */
/** Broker đọc passwd trong container — bind mount macOS đôi khi lệch so với file host. */
async function passwdVisibleInBrokerContainer(sessionId) {
  if (!isDockerCliEnabled()) return true;
  const passwdInContainer = containerPasswdPath();
  for (const name of dockerBrokerContainerCandidates()) {
    try {
      await execFileAsync(
        "docker",
        ["exec", name, "grep", "-q", `^${sessionId}:`, passwdInContainer],
        { timeout: 8000 }
      );
      return true;
    } catch {
      /* thử container khác */
    }
  }
  return false;
}

/** Docker Desktop (macOS): bind mount passwd có thể lệch host ↔ container — mirror sau khi ghi trong container. */
async function mirrorContainerPasswdToHost() {
  const file = passwdFilePath();
  if (!file || !isDockerCliEnabled()) return;
  const passwdInContainer = containerPasswdPath();
  for (const name of dockerBrokerContainerCandidates()) {
    try {
      const { stdout } = await execFileAsync(
        "docker",
        ["exec", name, "cat", passwdInContainer],
        { timeout: 10000, maxBuffer: 2 * 1024 * 1024 }
      );
      const tmpPath = `${file}.mirror.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmpPath, stdout, { mode: 0o600 });
      fs.renameSync(tmpPath, file);
      return;
    } catch {
      /* thử container khác */
    }
  }
}

async function upsertViaDockerExecPasswd(sessionId, mqttPasswordToken) {
  if (!isDockerCliEnabled()) {
    throw new Error("MQTT_DOCKER_CLI_ENABLED is not true");
  }
  const passwdInContainer = containerPasswdPath();
  const candidates = dockerBrokerContainerCandidates();
  if (!candidates.length) {
    throw new Error("no docker broker container configured");
  }
  let lastErr;
  for (const name of candidates) {
    try {
      await execFileAsync(
        "docker",
        ["exec", name, "mosquitto_passwd", "-b", passwdInContainer, sessionId, mqttPasswordToken],
        { timeout: 15000 }
      );
      if (!(await passwdVisibleInBrokerContainer(sessionId))) {
        throw new Error("user not visible in container passwd after mosquitto_passwd");
      }
      await mirrorContainerPasswdToHost();
      logInfo("[mosquitto-passwd] đã ghi user phiên (docker exec mosquitto_passwd)", {
        sessionId,
        container: name,
      });
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("docker exec mosquitto_passwd failed");
}

/**
 * mosquitto_passwd qua eclipse-mosquitto image khi không exec được vào container.
 */
async function upsertViaDockerPasswd(absFilePath, sessionId, mqttPasswordToken, createNew) {
  if (!isDockerCliEnabled()) {
    throw new Error("MQTT_DOCKER_CLI_ENABLED is not true");
  }
  const dir = path.dirname(absFilePath);
  const volPath = fs.existsSync(dir) ? dir : path.dirname(absFilePath);
  const basename = path.basename(absFilePath);
  const mounted = "/cfg";
  const args = ["run", "--rm", "-v", `${volPath}:${mounted}`, "eclipse-mosquitto:2", "mosquitto_passwd"];
  if (createNew) args.push("-b", "-c", `${mounted}/${basename}`, sessionId, mqttPasswordToken);
  else args.push("-b", `${mounted}/${basename}`, sessionId, mqttPasswordToken);

  await execFileAsync("docker", args, { timeout: 20000 });
}

async function upsertViaNativePasswd(absFilePath, sessionId, mqttPasswordToken, createNew) {
  const args = createNew
    ? ["-b", "-c", absFilePath, sessionId, mqttPasswordToken]
    : ["-b", absFilePath, sessionId, mqttPasswordToken];
  await execFileAsync("mosquitto_passwd", args, { timeout: 8000 });
}

/**
 * Remove an expired user from the Mosquitto password file.
 */
async function removeViaDockerPasswd(absFilePath, sessionId) {
  const dir = path.dirname(absFilePath);
  const volPath = fs.existsSync(dir) ? dir : path.dirname(absFilePath);
  const basename = path.basename(absFilePath);
  const mounted = "/cfg";
  const args = ["run", "--rm", "-v", `${volPath}:${mounted}`, "eclipse-mosquitto:2", "mosquitto_passwd", "-D", `${mounted}/${basename}`, sessionId];
  await execFileAsync("docker", args, { timeout: 20000 });
}

async function removeViaNativePasswd(absFilePath, sessionId) {
  const args = ["-D", absFilePath, sessionId];
  await execFileAsync("mosquitto_passwd", args, { timeout: 8000 });
}

module.exports = {
  isDockerCliEnabled,
  containerPasswdPath,
  dockerBrokerContainerCandidates,
  reloadMqttBroker,
  reloadMqttBrokerInDocker,
  passwdVisibleInBrokerContainer,
  mirrorContainerPasswdToHost,
  upsertViaDockerExecPasswd,
  upsertViaDockerPasswd,
  upsertViaNativePasswd,
  removeViaDockerPasswd,
  removeViaNativePasswd,
  scheduleHupOnce,
  _resetHupStateForTests,
  _getHupDebounceMs: () => HUP_DEBOUNCE_MS,
};
