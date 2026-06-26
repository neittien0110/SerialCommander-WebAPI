/**
 * @deprecated Dùng `scripts/delete_user.js` thay thế.
 *
 * File này đã được thay thế bởi phiên bản đầy đủ hơn trong scripts/:
 *   node scripts/delete_user.js <username|email|id> [--yes]
 *
 * Phiên bản trong scripts/ hỗ trợ:
 *   - Tìm theo email, username hoặc id
 *   - Confirmation prompt (hoặc --yes để bỏ qua)
 *   - Xóa toàn bộ dữ liệu liên quan (PasswordReset, EmailVerificationCode, Scenario, UserActivity)
 */
console.error(
  "[delete_user.js] ĐÃ LỖI THỜI. Chạy lệnh sau thay thế:\n" +
    "  node scripts/delete_user.js <username|email|id> [--yes]\n"
);
process.exit(1);
