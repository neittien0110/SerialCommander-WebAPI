require("dotenv").config({ path: "./.env" });
require("rootpath")();
const { User } = require("../models");

async function listAllUsers() {
  try {
    await require("../models").sequelize.authenticate();
    
    const users = await User.findAll({
      attributes: ['id', 'username', 'email', 'role', 'provider', 'googleId', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });
    
    console.log("\n📋 DANH SÁCH TẤT CẢ TÀI KHOẢN");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Tổng cộng: ${users.length} tài khoản\n`);
    
    users.forEach((user, index) => {
      console.log(`${index + 1}. ID: ${user.id}`);
      console.log(`   Username: ${user.username || "(null)"}`);
      console.log(`   Email:    ${user.email}`);
      console.log(`   Role:     ${user.role}`);
      console.log(`   Provider: ${user.provider || "local"}`);
      console.log(`   GoogleID: ${user.googleId || "(null)"}`);
      console.log(`   Created:  ${user.createdAt}`);
      console.log("");
    });
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Lỗi:", error.message);
    process.exit(1);
  }
}

listAllUsers();

