require("dotenv").config({ path: "./.env" });
require("rootpath")();
const { User } = require("../models");

async function checkUserByEmail() {
  try {
    const email = process.argv[2];
    
    if (!email) {
      console.error("❌ Vui lòng cung cấp email: node check_user_by_email.js <email>");
      process.exit(1);
    }
    
    await require("../models").sequelize.authenticate();
    
    const user = await User.findOne({ 
      where: { email },
      attributes: ['id', 'username', 'email', 'role', 'provider', 'googleId', 'createdAt', 'updatedAt']
    });
    
    if (user) {
      console.log("\n✅ Thông tin tài khoản:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`ID:           ${user.id}`);
      console.log(`Username:     ${user.username || "(null)"}`);
      console.log(`Email:        ${user.email}`);
      console.log(`Role:         ${user.role}`);
      console.log(`Provider:     ${user.provider}`);
      console.log(`GoogleID:     ${user.googleId || "(null) - ĐÃ BỊ XÓA/KHÓA"}`);
      console.log(`Password:     ${user.password ? (user.password.startsWith("LOCKED_ACCOUNT_") ? "🔒 ĐÃ BỊ KHÓA" : "✅ Có") : "❌ Không"}`);
      console.log(`Created At:   ${user.createdAt}`);
      console.log(`Updated At:   ${user.updatedAt}`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      if (!user.googleId && user.provider === "google") {
        console.log("\n⚠️  TÀI KHOẢN ĐÃ BỊ KHÓA - GoogleID đã bị xóa");
      }
      if (user.password && user.password.startsWith("LOCKED_ACCOUNT_")) {
        console.log("⚠️  TÀI KHOẢN ĐÃ BỊ KHÓA - Password đã bị khóa");
      }
    } else {
      console.log(`❌ Không tìm thấy tài khoản với email: ${email}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Lỗi:", error.message);
    process.exit(1);
  }
}

checkUserByEmail();

