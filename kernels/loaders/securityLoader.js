const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const path = require("path");
const { requestTraceMiddleware } = require("../middlewares/requestTraceMiddleware");
const { csrfProtection } = require("../middlewares/csrfMiddleware");

function isDevPrivateNetworkOrigin(origin) {
  if (process.env.NODE_ENV === "production") return false;
  const normalized = origin.replace(/\/+$/, "");
  if (
    normalized.startsWith("http://localhost:") ||
    normalized.startsWith("http://127.0.0.1:")
  ) {
    return true;
  }
  try {
    const { hostname, protocol } = new URL(normalized);
    if (protocol !== "http:" && protocol !== "https:") return false;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  } catch {
    return false;
  }
  return false;
}

/**
 * Origin có nằm trong allowlist FE không (dùng chung cho CORS và CSRF guard).
 * origin rỗng (same-origin / client không phải trình duyệt) coi như hợp lệ.
 */
function isAllowedOrigin(origin) {
  if (!origin) return true;
  const configured =
    process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "http://localhost:5173";
  const allowlist = configured
    .split(",")
    .map((x) => x.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const normalizedOrigin = origin.replace(/\/+$/, "");
  if (allowlist.includes(normalizedOrigin)) return true;
  if (isDevPrivateNetworkOrigin(normalizedOrigin)) return true;
  return false;
}

function configureSecurity(app) {
  app.disable("x-powered-by");

  // Tin tưởng 1 cấp reverse proxy (nginx/caddy) để req.ip nhận IP client thật từ XFF.
  // Không set → req.ip = socket IP (đúng khi không có proxy), set 1 → đúng khi sau 1 proxy.
  if (process.env.TRUST_PROXY != null) {
    const v = process.env.TRUST_PROXY;
    app.set("trust proxy", v === "true" ? true : v === "false" ? false : (Number(v) || v));
  } else if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.use(requestTraceMiddleware);

  const frontendOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "http://localhost:5173")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          connectSrc: ["'self'", ...frontendOrigins, "ws:", "wss:"],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
    })
  );

  app.use(express.json());

  app.use(
    cors({
      origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
      credentials: true,
      exposedHeaders: ["X-Request-Id"],
    })
  );

  // CSRF guard: chặn request thay đổi trạng thái được xác thực bằng cookie nếu
  // Origin/Referer không thuộc allowlist. Bổ sung cho SameSite, phủ cả chế độ
  // cross-origin (COOKIE_SAME_SITE=none) và endpoint upload multipart.
  app.use(csrfProtection);

  // Công khai: ảnh đại diện kịch bản (FeatureImage) phải xem được bởi khách chưa đăng nhập
  // ở trang Khám phá / share-code. Key chứa timestamp + random hex — không đoán được,
  // và driver S3 production cũng phục vụ qua URL public tương đương (không yêu cầu auth).
  app.use("/uploads", express.static(path.join(__dirname, "../../uploads")));
}

module.exports = { configureSecurity, isDevPrivateNetworkOrigin, isAllowedOrigin };
