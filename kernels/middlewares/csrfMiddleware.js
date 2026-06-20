const { sendError } = require("./errorHandler");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const AUTH_COOKIE_NAME = "sc_auth_token";
const REFRESH_COOKIE_NAME = "sc_refresh_token";

/**
 * Request có mang cookie xác thực (sc_auth_token / sc_refresh_token) không?
 * CSRF chỉ liên quan tới ambient credential do trình duyệt tự đính kèm; request
 * dùng Authorization: Bearer hoặc không kèm cookie không thể bị giả mạo cross-site.
 */
function requestCarriesAuthCookie(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return false;
  return cookieHeader.split(";").some((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return false;
    const name = part.slice(0, idx).trim();
    return name === AUTH_COOKIE_NAME || name === REFRESH_COOKIE_NAME;
  });
}

/** Rút origin (scheme://host) từ Referer khi header Origin vắng mặt. */
function originFromReferer(referer) {
  if (!referer) return null;
  try {
    const u = new URL(referer);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * CSRF guard dựa trên Origin/Referer cho request thay đổi trạng thái được xác
 * thực bằng cookie. Bổ sung defense-in-depth cho SameSite: phủ cả chế độ
 * cross-origin (COOKIE_SAME_SITE=none, lúc đó SameSite không còn tác dụng) và
 * các endpoint nhận multipart/form-data (content-type "simple" không kích hoạt
 * CORS preflight). Không cần token đồng bộ, không cần lưu state, không đụng FE.
 */
function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!requestCarriesAuthCookie(req)) return next();

  const origin =
    req.headers.origin || originFromReferer(req.headers.referer || req.headers.referrer);

  // Trình duyệt luôn gửi Origin trên POST/PUT/PATCH/DELETE cross-site. Thiếu cả
  // Origin lẫn Referer ⇒ không phải vector CSRF từ trình duyệt (vd: server-to-server).
  if (!origin) return next();

  // Lazy require để tránh circular dependency với securityLoader.
  const { isAllowedOrigin } = require("../loaders/securityLoader");
  if (isAllowedOrigin(origin)) return next();

  return sendError(
    res,
    403,
    "Yêu cầu bị từ chối: nguồn gốc không hợp lệ (CSRF)",
    "CSRF_ORIGIN_REJECTED"
  );
}

module.exports = { csrfProtection, requestCarriesAuthCookie };
