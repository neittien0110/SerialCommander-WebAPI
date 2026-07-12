/**
 * Chuyển pattern allowlist chứa "*" thành RegExp so khớp toàn chuỗi.
 * "*" chỉ khớp đúng 1 nhãn hostname (chữ, số, gạch ngang) — không khớp qua
 * dấu chấm, nên "https://*.toolhub.app" khớp https://serial2.toolhub.app
 * nhưng không khớp https://a.b.toolhub.app hay https://x.toolhub.app.evil.com.
 *
 * @param {string} pattern — vd "https://*.toolhub.app" hoặc "*.toolhub.app"
 * @returns {RegExp}
 */
function wildcardToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[a-z0-9-]+");
  return new RegExp(`^${escaped}$`, "i");
}

module.exports = { wildcardToRegExp };
