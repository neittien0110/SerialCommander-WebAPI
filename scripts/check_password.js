require("dotenv").config({ path: "./.env" });
require("rootpath")();
const { User } = require("../models");

async function checkPassword() {
  try {
    const username = process.argv[2] || "huyen";
    
    console.log(`🔍 Đang kiểm tra password của user: "${username}"...\n`);

    const user = await User.findOne({ 
      where: { username },
      attributes: ['id', 'username', 'email', 'password', 'provider']
    });

    if (!user) {
      console.log(`❌ Không tìm thấy user với username: "${username}"`);
      process.exit(1);
    }

    console.log(`✅ Tìm thấy user:`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`ID:           ${user.id}`);
    console.log(`Username:     ${user.username}`);
    console.log(`Email:        ${user.email}`);
    console.log(`Provider:     ${user.provider}`);
    console.log(`Password:     ${user.password ? '✅ Có (đã được hash)' : '❌ Không'}`);
    
    if (user.password) {
      console.log(`Password Hash: ${user.password.substring(0, 20)}... (${user.password.length} ký tự)`);
      console.log(`\n✅ Password đã được lưu trong database!`);
    } else {
      console.log(`\n⚠️  User này chưa có password.`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Lỗi:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkPassword();




