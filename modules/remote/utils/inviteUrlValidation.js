const { wildcardToRegExp } = require("../../../utils/wildcardPattern");

/**
 * Xác thực inviteUrl chỉ cho phép hostname nằm trong FRONTEND_URLS/FRONTEND_URL.
 * Ngăn Open Redirect — kẻ tấn công không thể gửi email chứa link độc hại từ server.
 * Entry wildcard (vd "https://*.toolhub.app") chấp nhận mọi subdomain 1 cấp.
 *
 * @param {string} inviteUrl
 * @param {{ frontendUrls?: string }} [options] — inject env cho unit test
 * @returns {boolean}
 */
function isAllowedInviteUrl(inviteUrl, options = {}) {
  let parsed;
  try {
    parsed = new URL(String(inviteUrl));
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const configured =
    options.frontendUrls ||
    process.env.FRONTEND_URLS ||
    process.env.FRONTEND_URL ||
    "http://localhost:5173";

  const allowedHosts = configured
    .split(",")
    .map((u) => {
      try {
        return new URL(u.trim()).hostname;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return allowedHosts.some((host) =>
    host.includes("*")
      ? wildcardToRegExp(host).test(parsed.hostname)
      : host === parsed.hostname
  );
}

module.exports = { isAllowedInviteUrl };
