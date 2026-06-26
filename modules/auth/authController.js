const bcrypt = require("bcryptjs");
const { User } = require("../../models");
const passport = require("../../configs/passport");
const googleOAuthEnabled = passport.googleOAuthEnabled;
const getGoogleOAuthConfig = require("../../configs/googleOAuth");
const { sendError, sendSuccess } = require("../../kernels/middlewares/errorHandler");
const { logError } = require("../../kernels/logging/appLogger");
const {
  getLoginIdentifier,
  buildLoginWhere,
  isGoogleOnlyAccount,
  isLocalUnverified,
} = require("./services/authDomainService");
const { registerLocalUser, mapRegisterError } = require("./services/authRegisterService");
const {
  verifyEmailCode,
  resendVerificationCode,
  requestPasswordReset,
  verifyPasswordResetCode,
  resetPasswordWithCode,
} = require("./services/authFlowService");
const {
  issueRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
} = require("./services/refreshTokenService");
const {
  FRONTEND_URL,
  generateToken,
  setAuthCookie,
  setRefreshCookie,
  clearAuthCookie,
  extractRefreshTokenFromCookie,
  decodeRefreshPayload,
  sendServiceErrorOrInternal,
} = require("./authHttpService");

exports.login = async (req, res) => {
  const { password } = req.body;
  const identifier = getLoginIdentifier(req.body);
  if (!identifier || !password) {
    return sendError(res, 400, "Email và mật khẩu là bắt buộc.", "AUTH_INVALID_INPUT");
  }

  try {
    const where = buildLoginWhere(identifier);
    const user = await User.findOne({ where });
    if (!user || isLocalUnverified(user)) {
      return sendError(res, 401, "Sai email hoặc mật khẩu", "AUTH_INVALID_CREDENTIALS");
    }

    if (isGoogleOnlyAccount(user)) {
      return sendError(res, 401, "Tài khoản này đăng nhập bằng Google. Vui lòng sử dụng đăng nhập Google.", "AUTH_GOOGLE_ACCOUNT");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendError(res, 401, "Sai email hoặc mật khẩu", "AUTH_INVALID_CREDENTIALS");
    }

    const token = generateToken(user);
    const refreshToken = await issueRefreshToken(user.id);
    setAuthCookie(res, token);
    setRefreshCookie(res, refreshToken);
    return sendSuccess(res, 200, "Đăng nhập thành công", { userId: user.id });
  } catch (error) {
    logError("Login error", { error: error.message });
    return sendError(res, 500, "Lỗi server. Vui lòng thử lại sau.", "AUTH_LOGIN_FAILED");
  }
};

exports.register = async (req, res) => {
  const { password, email, username } = req.body;
  try {
    const result = await registerLocalUser({ password, email, username });

    const payload = {
      requireEmailVerification: true,
      email: result.email,
      emailSent: result.emailSent,
      pendingOnly: true,
    };
    if (result.devOtp && process.env.NODE_ENV !== "production") {
      payload.devOtp = result.devOtp;
      return sendSuccess(
        res,
        201,
        `Đã tạo mã xác thực (chế độ phát triển: ${result.devOtp}). Tài khoản chỉ được tạo sau khi nhập mã đúng.`,
        payload
      );
    }
    return sendSuccess(
      res,
      201,
      result.emailSent
        ? "Đã gửi mã xác thực đến email của bạn. Vui lòng nhập mã để hoàn tất đăng ký."
        : "Không gửi được email xác thực. Bấm «Gửi lại mã» hoặc thử lại sau.",
      payload
    );
  } catch (error) {
    const mapped = mapRegisterError(error);
    if (mapped.status >= 500) {
      logError("Register error:", { error: error.message });
      if (error.parent?.sqlMessage) logError("SQL:", { detail: error.parent.sqlMessage });
    }
    return sendError(res, mapped.status, mapped.message, mapped.code);
  }
};

exports.verifyEmail = async (req, res) => {
  const { email, code, username } = req.body;
  if (!email || !code) {
    return sendError(res, 400, "Email và mã xác thực là bắt buộc", "AUTH_INVALID_INPUT");
  }

  try {
    const result = await verifyEmailCode(email, code, username);
    if (result.alreadyVerified) {
      return sendSuccess(res, 200, "OK", { alreadyVerified: true });
    }
    return sendSuccess(res, 200, "OK", { verified: true });
  } catch (error) {
    return sendServiceErrorOrInternal(res, error, "AUTH_VERIFY_EMAIL_FAILED", "Verify email error");
  }
};

exports.resendVerificationCode = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return sendError(res, 400, "Email là bắt buộc", "AUTH_INVALID_INPUT");
  }

  try {
    const result = await resendVerificationCode(email);
    if (result.ignored) {
      return sendError(
        res,
        400,
        "Chưa có mã xác thực được gửi đến email này. Vui lòng đăng ký lại.",
        "AUTH_NO_PENDING_REGISTRATION"
      );
    }
    if (result.alreadyVerified) {
      return sendSuccess(res, 200, "OK", { alreadyVerified: true });
    }
    if (result.devOtp && process.env.NODE_ENV !== "production") {
      return sendSuccess(
        res,
        200,
        `Chế độ phát triển: mã xác thực là ${result.devOtp}.`,
        { devOtp: result.devOtp, emailSent: false }
      );
    }
    return sendSuccess(res, 200, "Đã gửi lại mã xác thực email.", { emailSent: true });
  } catch (error) {
    return sendServiceErrorOrInternal(res, error, "AUTH_RESEND_OTP_FAILED", "Resend verification code error");
  }
};

exports.googleOAuthStatus = (req, res) => {
  return sendSuccess(res, 200, "OK", {
    enabled: googleOAuthEnabled,
    callbackURL: googleOAuthEnabled ? getGoogleOAuthConfig().callbackURL : undefined,
  });
};

exports.googleAuth = (req, res, next) => {
  if (!googleOAuthEnabled) {
    return res.redirect(`${FRONTEND_URL}/login?error=oauth_not_configured`);
  }
  passport.authenticate("google", {
    scope: ["profile", "email"],
    state: false,
    session: false,
  })(req, res, next);
};

exports.googleCallback = (req, res, next) => {
  if (!googleOAuthEnabled) {
    return res.redirect(`${FRONTEND_URL}/login?error=oauth_not_configured`);
  }
  if (req.query.error === "access_denied") {
    return res.redirect(`${FRONTEND_URL}/login?error=access_denied`);
  }
  passport.authenticate("google", { session: false }, async (err, user, info) => {
    if (err) {
      logError("Google OAuth error:", { error: err.message });
      const msg = String(err.message || "").toLowerCase();
      const errorCode =
        msg.includes("client secret is invalid") || msg.includes("invalid_client")
          ? "oauth_invalid_secret"
          : "oauth_failed";
      return res.redirect(`${FRONTEND_URL}/login?error=${errorCode}`);
    }

    if (!user) {
      const errorCode = info?.message === "EMAIL_LINKED_TO_LOCAL"
        ? "email_linked_to_local"
        : "oauth_failed";
      return res.redirect(`${FRONTEND_URL}/login?error=${errorCode}`);
    }

    const token = generateToken(user);
    const refreshToken = await issueRefreshToken(user.id);
    setAuthCookie(res, token);
    setRefreshCookie(res, refreshToken);
    const setupProfile = user._isNewOAuthUser ? "&setupProfile=1" : "";
    res.redirect(`${FRONTEND_URL}/?oauthSuccess=1&uid=${user.id}${setupProfile}`);
  })(req, res, next);
};

exports.requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return sendError(res, 400, "Email là bắt buộc", "AUTH_INVALID_INPUT");
  }

  try {
    const result = await requestPasswordReset(email);
    if (result.notFound) {
      return sendError(res, 404, "Không tìm thấy tài khoản với email này", "AUTH_EMAIL_NOT_FOUND");
    }
    if (result.googleAccount) {
      return sendError(res, 400, "Tài khoản này đăng nhập bằng Google. Vui lòng sử dụng đăng nhập Google.", "AUTH_GOOGLE_ACCOUNT");
    }
    if (result.emailSendFailed) {
      return sendError(res, 503, "Không gửi được email đặt lại mật khẩu. Thử lại sau hoặc liên hệ quản trị.", "AUTH_EMAIL_SEND_FAILED");
    }
    if (result.devOtp && process.env.NODE_ENV !== "production") {
      return sendSuccess(res, 200, "OK", { devOtp: result.devOtp, emailSent: false });
    }
    return sendSuccess(res, 200, "OK", { emailSent: true });
  } catch (error) {
    return sendServiceErrorOrInternal(res, error, "AUTH_REQUEST_RESET_FAILED", "Request password reset error");
  }
};

exports.verifyResetCode = async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return sendError(res, 400, "Email và mã xác nhận là bắt buộc", "AUTH_INVALID_INPUT");
  }

  try {
    await verifyPasswordResetCode(email, code);
    return sendSuccess(res, 200, "Mã xác nhận hợp lệ", { valid: true });
  } catch (error) {
    return sendServiceErrorOrInternal(res, error, "AUTH_VERIFY_RESET_FAILED", "Verify reset code error");
  }
};

exports.logout = async (req, res) => {
  const raw = extractRefreshTokenFromCookie(req);
  if (raw) {
    const payload = decodeRefreshPayload(raw);
    if (payload?.id && payload?.tokenId) {
      try {
        await revokeRefreshToken(payload.id, payload.tokenId);
      } catch { /* best-effort */ }
    }
  }
  clearAuthCookie(res);
  return sendSuccess(res, 200, "Đăng xuất thành công");
};

exports.refresh = async (req, res) => {
  const raw = extractRefreshTokenFromCookie(req);
  if (!raw) {
    return sendError(res, 401, "Refresh token không tồn tại.", "REFRESH_TOKEN_MISSING");
  }

  const validated = await verifyRefreshToken(raw);
  if (!validated) {
    clearAuthCookie(res);
    return sendError(res, 401, "Refresh token không hợp lệ hoặc đã hết hạn.", "REFRESH_TOKEN_INVALID");
  }

  try {
    const user = await User.findByPk(validated.userId, {
      attributes: ["id", "username", "email", "role"],
    });
    if (!user) {
      clearAuthCookie(res);
      return sendError(res, 401, "Tài khoản không còn tồn tại.", "REFRESH_USER_NOT_FOUND");
    }

    await revokeRefreshToken(validated.userId, validated.tokenId);

    const newAccessToken = generateToken(user);
    const newRefreshToken = await issueRefreshToken(user.id);
    setAuthCookie(res, newAccessToken);
    setRefreshCookie(res, newRefreshToken);
    return sendSuccess(res, 200, "Refresh thành công.", { userId: user.id });
  } catch (error) {
    logError("Refresh error:", { error: error.message });
    return sendError(res, 500, "Lỗi server khi refresh token.", "REFRESH_FAILED");
  }
};

exports.resetPassword = async (req, res) => {
  const { email, code, newPassword } = req.body;

  if (!email || !code || !newPassword) {
    return sendError(res, 400, "Email, mã xác nhận và mật khẩu mới là bắt buộc", "AUTH_INVALID_INPUT");
  }

  const { validatePassword } = require("../../utils/emailValidation");
  const passwordCheck = validatePassword(newPassword);
  if (!passwordCheck.ok) {
    return sendError(res, 400, passwordCheck.message, "AUTH_PASSWORD_WEAK");
  }

  try {
    await resetPasswordWithCode(email, code, newPassword);
    return sendSuccess(res, 200, "Đặt lại mật khẩu thành công. Vui lòng đăng nhập với mật khẩu mới.");
  } catch (error) {
    return sendServiceErrorOrInternal(res, error, "AUTH_RESET_PASSWORD_FAILED", "Reset password error");
  }
};
