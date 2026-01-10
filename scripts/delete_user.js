require("dotenv").config({ path: "./.env" });
require("rootpath")();
const { User, PasswordReset } = require("../models");

async function deleteUser() {
  try {
    const identifier = process.argv[2]; // username, email, hoặc ID
    
    if (!identifier) {
      console.log("❌ Vui lòng cung cấp username, email hoặc ID");
      console.log("Usage: node scripts/delete_user.js <username|email|id>");
      process.exit(1);
    }
    
    console.log(`🔍 Đang tìm user: "${identifier}"...\n`);
    
    // Tìm user
    let user;
    if (!isNaN(identifier)) {
      // Nếu là số, tìm theo ID
      user = await User.findByPk(identifier);
    } else if (identifier.includes("@")) {
      // Nếu có @, tìm theo email
      user = await User.findOne({ where: { email: identifier } });
    } else {
      // Tìm theo username
      user = await User.findOne({ where: { username: identifier } });
    }
    
    if (!user) {
      console.log(`❌ Không tìm thấy user với: "${identifier}"`);
      process.exit(1);
    }
    
    // Hiển thị thông tin user trước khi xóa
    console.log("📋 Thông tin user sẽ bị xóa:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`ID:           ${user.id}`);
    console.log(`Username:     ${user.username || "(null)"}`);
    console.log(`Email:        ${user.email}`);
    console.log(`Role:         ${user.role}`);
    console.log(`Provider:     ${user.provider || "local"}`);
    console.log(`Google ID:    ${user.googleId || "(null)"}`);
    console.log(`Created At:   ${user.createdAt}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    // Xác nhận
    const readline = require("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    rl.question("⚠️  Bạn có chắc chắn muốn xóa user này? (yes/no): ", async (answer) => {
      if (answer.toLowerCase() !== "yes" && answer.toLowerCase() !== "y") {
        console.log("❌ Đã hủy. User không bị xóa.");
        rl.close();
        process.exit(0);
      }
      
      try {
        // Xóa các password reset records liên quan
        const deletedResets = await PasswordReset.destroy({ where: { email: user.email } });
        console.log(`🗑️  Đã xóa ${deletedResets} password reset record(s)`);
        
        // Xóa user
        await user.destroy();
        
        console.log("\n✅ Đã xóa user thành công!");
        console.log(`   Username: ${user.username || "(null)"}`);
        console.log(`   Email:    ${user.email}`);
        
        rl.close();
        process.exit(0);
      } catch (error) {
        console.error("❌ Lỗi khi xóa user:", error.message);
        rl.close();
        process.exit(1);
      }
    });
  } catch (error) {
    console.error("❌ Lỗi:", error.message);
    process.exit(1);
  }
}

deleteUser();



