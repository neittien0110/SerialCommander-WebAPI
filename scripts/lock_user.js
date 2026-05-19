require("dotenv").config({ path: "./.env" });
require("rootpath")();
const { User } = require("../models");

async function lockUser() {
  try {
    const email = process.argv[2];
    
    if (!email) {
      console.error("❌ Vui lòng cung cấp email: node lock_user.js <email>");
      process.exit(1);
    }
    
    await require("../models").sequelize.authenticate();
    
    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      console.error(`❌ Không tìm thấy tài khoản với email: ${email}`);
      process.exit(1);
    }
    
    console.log(`\n🔒 Đang khóa tài khoản: ${email}...\n`);
    console.log("Thông tin tài khoản trước khi khóa:");
    console.log(`  ID: ${user.id}`);
    console.log(`  Username: ${user.username || "(null)"}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Provider: ${user.provider}`);
    console.log(`  GoogleID: ${user.googleId || "(null)"}\n`);
    
    // Khóa tài khoản bằng cách xóa googleId và đặt password thành null
    // Nếu là tài khoản Google, xóa googleId sẽ khiến không thể đăng nhập bằng Google
    // Nếu là tài khoản local, đặt password thành một chuỗi đặc biệt
    const updates = {};
    
    if (user.provider === "google" && user.googleId) {
      updates.googleId = null;
      console.log("✅ Đã xóa GoogleID - tài khoản không thể đăng nhập bằng Google");
    }
    
    if (user.password) {
      // Đặt password thành chuỗi đặc biệt để khóa
      updates.password = "LOCKED_ACCOUNT_" + Date.now();
      console.log("✅ Đã khóa mật khẩu local");
    }
    
    await user.update(updates);
    
    console.log("\n✅ Đã khóa tài khoản thành công!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Lỗi:", error.message);
    process.exit(1);
  }
}

lockUser();

