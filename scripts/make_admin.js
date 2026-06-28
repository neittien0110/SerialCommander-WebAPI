require("dotenv").config({ path: "./.env" });
require("rootpath")();
const { User } = require("../models");

async function makeAdmin() {
  try {
    const email = process.argv[2];
    
    if (!email) {
      console.error("❌ Lỗi: Vui lòng cung cấp email của tài khoản cần cấp quyền admin.");
      console.log("👉 Sử dụng: node scripts/make_admin.js <email>");
      process.exit(1);
    }

    console.log(`🔍 Đang tìm kiếm user với email: "${email}"...\n`);
    
    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      console.log("❌ Không tìm thấy user với email này.");
      process.exit(1);
    }
    
    // Cập nhật role
    user.role = 'admin';
    await user.save();
    
    console.log(`✅ Thành công! Đã cấp quyền admin cho user: ${email} (ID: ${user.id})`);
  } catch (error) {
    console.error("❌ Đã xảy ra lỗi:", error);
  } finally {
    process.exit(0);
  }
}

makeAdmin();
