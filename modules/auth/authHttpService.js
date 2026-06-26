const jwt = require("jsonwebtoken");
const jwtConfig = require("../../configs/jwt");
const { getJwtSecret } = require("../../configs/envSecrets");
const { sendError } = require("../../kernels/middlewares/errorHandler");
const { logError } = require("../../kernels/logging/appLogger");
const { REFRESH_TTL_SEC } = require("./services/refreshTokenService");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const AUTH_COOKIE_NAME = "sc_auth_token";
const REFRESH_COOKIE_NAME = "sc_refresh_token";

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username || user.email, role: user.role, type: "access" },
    getJwtSecret(),
    { expiresIn: jwtConfig.ttl }
  );
}

/**
 * Cookie attrs dùng chung cho set và clear — sameSite=none khi COOKIE_SAME_SITE=none
 * (cross-origin FE/API trên production, yêu cầu HTTPS).
 */
function getAuthCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  const crossOrigin = process.env.COOKIE_SAME_SITE === "none";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: crossOrigin ? "none" : "lax",
    path: "/",
  };
}

function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    ...getAuthCookieOptions(),
    maxAge: 24 * 60 * 60 * 1000,
  });
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...getAuthCookieOptions(),
    maxAge: REFRESH_TTL_SEC * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, getAuthCookieOptions());
  res.clearCookie(REFRESH_COOKIE_NAME, getAuthCookieOptions());
}

function extractRefreshTokenFromCookie(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === REFRESH_COOKIE_NAME) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function decodeRefreshPayload(raw) {
  try {
    return jwt.decode(raw);
  } catch {
    return null;
  }
}

function sendServiceErrorOrInternal(res, error, fallbackCode, fallbackLogLabel) {
  if (error.status && error.code) {
    return sendError(res, error.status, error.message, error.code);
  }
  logError(`${fallbackLogLabel}:`, { error: error.message });
  return sendError(res, 500, "Lỗi server. Vui lòng thử lại sau.", fallbackCode);
}

module.exports = {
  FRONTEND_URL,
  AUTH_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  generateToken,
  getAuthCookieOptions,
  setAuthCookie,
  setRefreshCookie,
  clearAuthCookie,
  extractRefreshTokenFromCookie,
  decodeRefreshPayload,
  sendServiceErrorOrInternal,
};
