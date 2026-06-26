const crypto = require("crypto");

function timingSafeEqualString(a, b) {
  // Hash cả hai trước khi so sánh: loại bỏ timing leak từ early-return theo độ dài.
  const hashA = crypto.createHash("sha256").update(String(a ?? "")).digest();
  const hashB = crypto.createHash("sha256").update(String(b ?? "")).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function verifyJoinChallenge(record, joinChallenge) {
  if (!record?.joinChallenge || !joinChallenge) return false;
  return timingSafeEqualString(record.joinChallenge, joinChallenge);
}

module.exports = {
  timingSafeEqualString,
  verifyJoinChallenge,
};
