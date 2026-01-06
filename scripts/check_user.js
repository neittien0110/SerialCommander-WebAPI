require("dotenv").config({ path: "./.env" });
require("rootpath")();
const { User } = require("../models");

async function checkUser() {
  try {
    const username = process.argv[2] || "huyen";
    
    console.log(`🔍 Đang tìm kiếm user với username: "${username}"...\n`);
    
    // Tìm theo username
    const userByUsername = await User.findOne({ 
      where: { username: username },
      attributes: ['id', 'username', 'email', 'role', 'provider', 'googleId', 'createdAt']
    });
    
    // Tìm theo email nếu username không tìm thấy
    let userByEmail = null;
    if (!userByUsername) {
      userByEmail = await User.findOne({ 
        where: { email: `${username}@gmail.com` },
        attributes: ['id', 'username', 'email', 'role', 'provider', 'googleId', 'createdAt']
      });
    }
    
    // Hiển thị kết quả
    if (userByUsername) {
      console.log("✅ Tìm thấy user theo username:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`ID:           ${userByUsername.id}`);
      console.log(`Username:     ${userByUsername.username || "(null)"}`);
      console.log(`Email:        ${userByUsername.email}`);
      console.log(`Role:         ${userByUsername.role}`);
      console.log(`Provider:     ${userByUsername.provider || "local"}`);
      console.log(`Google ID:    ${userByUsername.googleId || "(null)"}`);
      console.log(`Created At:   ${userByUsername.createdAt}`);
      console.log(`Has Password: ${userByUsername.password ? "✅ Có" : "❌ Không"}`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    } else if (userByEmail) {
      console.log("✅ Tìm thấy user theo email:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`ID:           ${userByEmail.id}`);
      console.log(`Username:     ${userByEmail.username || "(null)"}`);
      console.log(`Email:        ${userByEmail.email}`);
      console.log(`Role:         ${userByEmail.role}`);
      console.log(`Provider:     ${userByEmail.provider || "local"}`);
      console.log(`Google ID:    ${userByEmail.googleId || "(null)"}`);
      console.log(`Created At:   ${userByEmail.createdAt}`);
      console.log(`Has Password: ${userByEmail.password ? "✅ Có" : "❌ Không"}`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    } else {
      console.log(`❌ Không tìm thấy user với username hoặc email chứa "${username}"`);
      
      // Tìm tất cả user có username chứa "huyen"
      console.log("\n🔍 Đang tìm tất cả user có username chứa 'huyen'...");
      const allUsers = await User.findAll({
        where: {
          username: {
            [require("sequelize").Op.like]: `%${username}%`
          }
        },
        attributes: ['id', 'username', 'email', 'role', 'provider', 'googleId']
      });
      
      if (allUsers.length > 0) {
        console.log(`\n✅ Tìm thấy ${allUsers.length} user(s):`);
        allUsers.forEach((user, index) => {
          console.log(`\n${index + 1}. User ID: ${user.id}`);
          console.log(`   Username: ${user.username || "(null)"}`);
          console.log(`   Email:    ${user.email}`);
          console.log(`   Provider: ${user.provider || "local"}`);
        });
      } else {
        // Tìm tất cả user
        console.log("\n📋 Danh sách tất cả users trong database:");
        const allUsers = await User.findAll({
          attributes: ['id', 'username', 'email', 'role', 'provider', 'googleId'],
          limit: 20
        });
        
        if (allUsers.length > 0) {
          console.log(`\nTổng cộng: ${allUsers.length} user(s)\n`);
          allUsers.forEach((user, index) => {
            console.log(`${index + 1}. ID: ${user.id} | Username: ${user.username || "(null)"} | Email: ${user.email} | Provider: ${user.provider || "local"}`);
          });
        } else {
          console.log("❌ Không có user nào trong database");
        }
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Lỗi:", error.message);
    process.exit(1);
  }
}

checkUser();



