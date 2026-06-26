/**
 * Đọc/ghi/parse Mosquitto password_file trên host (native, không subprocess) +
 * resolve đường dẫn passwd file + hàng đợi tuần tự cho các thao tác ghi.
 *
 * Lưu ý: MQTT_PASSWD_FILE nên là đường dẫn tương đối WebAPI root — resolve theo __dirname, không theo cwd.
 */
const fs = require("fs");
const path = require("path");
const { hashMosquittoPassword } = require("./passwdHash");

/** SerialCommander-WebAPI-main/ (từ kernels/remoteSession/). */
const WEBAPI_ROOT = path.join(__dirname, "..", "..");

function passwdFilePath() {
  const raw = process.env.MQTT_PASSWD_FILE;
  if (!raw || !String(raw).trim()) return null;
  const trimmed = String(raw).trim();
  if (path.isAbsolute(trimmed)) return trimmed;
  return path.resolve(WEBAPI_ROOT, trimmed);
}

/**
 * Ghi entry vào passwd file dùng native PBKDF2 — không cần mosquitto_passwd CLI.
 * Dùng atomic rename (write → tmp → rename) để tránh partial-write corruption.
 */
function writePasswdEntryNative(absFilePath, sessionId, password, createNew) {
  const hash = hashMosquittoPassword(password);
  const newEntry = `${sessionId}:${hash}`;

  let lines = [];
  if (!createNew) {
    try {
      const existing = fs.readFileSync(absFilePath, "utf8");
      lines = existing.split("\n").filter(Boolean);
    } catch {
      // file không tồn tại → tạo mới
    }
  }

  const userPrefix = `${sessionId}:`;
  const idx = lines.findIndex((l) => l.startsWith(userPrefix));
  if (idx >= 0) {
    lines[idx] = newEntry;
  } else {
    lines.push(newEntry);
  }

  const content = lines.join("\n") + "\n";
  const tmpPath = `${absFilePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, content, { mode: 0o600 });
  fs.renameSync(tmpPath, absFilePath);
}

/**
 * Xóa entry khỏi passwd file (native).
 */
function removePasswdEntryNative(absFilePath, sessionId) {
  if (!fs.existsSync(absFilePath)) return;
  const existing = fs.readFileSync(absFilePath, "utf8");
  const userPrefix = `${sessionId}:`;
  const lines = existing.split("\n").filter((l) => Boolean(l) && !l.startsWith(userPrefix));
  const content = lines.join("\n") + (lines.length ? "\n" : "");
  const tmpPath = `${absFilePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, content, { mode: 0o600 });
  fs.renameSync(tmpPath, absFilePath);
}

function passwdFileHasUser(sessionId) {
  const file = passwdFilePath();
  if (!file || !fs.existsSync(file)) return false;
  try {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    return lines.some((line) => line.startsWith(`${sessionId}:`));
  } catch {
    return false;
  }
}

/**
 * Hàng đợi tuần tự cho các thao tác ghi passwd file.
 * Tránh race condition khi nhiều session được tạo cùng lúc.
 */
let _writeQueue = Promise.resolve();
function enqueueWrite(fn) {
  // Luôn gọi fn() không có argument (không truyền rejection error làm arg).
  // Đảm bảo queue tiếp tục chạy dù promise trước thành công hay thất bại.
  _writeQueue = _writeQueue.then(() => fn(), () => fn());
  return _writeQueue;
}

module.exports = {
  WEBAPI_ROOT,
  passwdFilePath,
  writePasswdEntryNative,
  removePasswdEntryNative,
  passwdFileHasUser,
  enqueueWrite,
};
