/**
 * Native Mosquitto passwd hashing (PBKDF2, Mosquitto 2.x format).
 * Tách riêng khỏi mosquittoPasswdSync.js để giữ seam crypto độc lập với I/O/process.
 *
 * Format: PBKDF2$sha512$<iterations>$<salt_base64>$<key_base64>
 * Tham số mặc định khớp Mosquitto 2.0 (password_mosq.c: DEFAULT_ITERATIONS=901, SALT_LEN=12, KEY_LEN=64).
 */
const crypto = require("crypto");

const PBKDF2_ITERATIONS = Number(process.env.MQTT_PASSWD_ITERATIONS || 901);
const PBKDF2_SALT_BYTES = 12;
const PBKDF2_KEY_BYTES = 64;
const PBKDF2_DIGEST = "sha512";

/**
 * Tính Mosquitto passwd hash bằng PBKDF2-SHA512 trong Node.js.
 * Không gọi subprocess — password không xuất hiện trong process args hay cmdline.
 */
function hashMosquittoPassword(password) {
  const salt = crypto.randomBytes(PBKDF2_SALT_BYTES);
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_BYTES, PBKDF2_DIGEST);
  return `PBKDF2$sha512$${PBKDF2_ITERATIONS}$${salt.toString("base64")}$${key.toString("base64")}`;
}

module.exports = {
  hashMosquittoPassword,
};
