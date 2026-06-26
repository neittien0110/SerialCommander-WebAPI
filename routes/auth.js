const express = require("express");
const router = express.Router();
const authController = require("modules/auth/authController");
const { createSimpleRateLimit } = require("../kernels/middlewares/simpleRateLimit");
const { validateAuth } = require("../kernels/validations");
const {
  registerValidators,
  verifyEmailValidators,
  resendVerificationValidators,
  loginValidators,
  forgotPasswordValidators,
  verifyResetValidators,
  resetPasswordValidators,
} = require("../kernels/validations/authValidators");

const authLoginRateLimit = createSimpleRateLimit({ windowMs: 60 * 1000, maxRequests: 10 });
const authRegisterRateLimit = createSimpleRateLimit({ windowMs: 60 * 1000, maxRequests: 5 });
const authOtpRateLimit = createSimpleRateLimit({ windowMs: 60 * 1000, maxRequests: 8 });
const authResetRateLimit = createSimpleRateLimit({ windowMs: 60 * 1000, maxRequests: 6 });

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Log in a user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginSuccessResponse'
 *       401:
 *         description: Incorrect email or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/login", authLoginRateLimit, validateAuth(loginValidators), authController.login);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new account
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: Registration successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RegisterSuccessResponse'
 *       400:
 *         description: Email or username already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/register", authRegisterRateLimit, validateAuth(registerValidators), authController.register);

/**
 * @swagger
 * /api/auth/verify-email:
 *   post:
 *     summary: Verify email with OTP code
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Verification successful or already verified
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageSuccessResponse'
 *       400:
 *         description: Invalid code, expired, or bad input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/verify-email", authOtpRateLimit, validateAuth(verifyEmailValidators), authController.verifyEmail);

/**
 * @swagger
 * /api/auth/resend-verification-code:
 *   post:
 *     summary: Resend email verification code
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Code sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageSuccessResponse'
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/resend-verification-code",
  authOtpRateLimit,
  validateAuth(resendVerificationValidators),
  authController.resendVerificationCode
);

/**
 * @swagger
 * /api/auth/google/status:
 *   get:
 *     summary: Google OAuth configuration status
 *     tags: [Authentication]
 */
router.get("/google/status", authController.googleOAuthStatus);

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Sign in with Google OAuth
 *     tags: [Authentication]
 *     responses:
 *       302:
 *         description: Redirect to Google OAuth
 */
router.get("/google", authController.googleAuth);

/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     tags: [Authentication]
 *     responses:
 *       302:
 *         description: Redirect to frontend with token
 */
router.get("/google/callback", authController.googleCallback);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset code
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email sent (if account exists)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageSuccessResponse'
 *       400:
 *         description: Invalid input or Google-only account
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/forgot-password",
  authOtpRateLimit,
  validateAuth(forgotPasswordValidators),
  authController.requestPasswordReset
);

/**
 * @swagger
 * /api/auth/verify-reset-code:
 *   post:
 *     summary: Verify password reset code
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *             properties:
 *               email:
 *                 type: string
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Code is valid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VerifyResetCodeSuccessResponse'
 *       400:
 *         description: Invalid or expired code
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/verify-reset-code",
  authOtpRateLimit,
  validateAuth(verifyResetValidators),
  authController.verifyResetCode
);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password with verification code
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *               code:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password reset successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageSuccessResponse'
 *       400:
 *         description: Invalid code or password too short
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/reset-password",
  authResetRateLimit,
  validateAuth(resetPasswordValidators),
  authController.resetPassword
);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token using HttpOnly cookie sc_refresh_token
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: New access token set in cookie sc_auth_token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageSuccessResponse'
 *       401:
 *         description: Refresh token missing, invalid, or expired
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/refresh", authController.refresh);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Log out — clears HttpOnly cookies sc_auth_token and sc_refresh_token
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post("/logout", authController.logout);

module.exports = router;
