require("dotenv").config({ path: "./.env" });
require("rootpath")();
const { UserActivity } = require("../models");

async function testActivityAPI() {
  try {
    console.log("🧪 Testing UserActivity Model...\n");

    // Test 1: Kiểm tra bảng có tồn tại không
    console.log("1. Kiểm tra bảng UserActivities...");
    const tableExists = await UserActivity.sequelize.getQueryInterface().showAllTables();
    const hasTable = tableExists.some(table => table === 'UserActivities' || table === 'useractivities');
    console.log(`   ${hasTable ? '✅' : '❌'} Bảng UserActivities: ${hasTable ? 'Tồn tại' : 'Chưa tồn tại'}\n`);

    if (!hasTable) {
      console.log("⚠️  Bảng chưa tồn tại. Vui lòng chạy migration SQL trước.");
      process.exit(1);
    }

    // Test 2: Đếm số records hiện có
    console.log("2. Đếm số activity records...");
    const count = await UserActivity.count();
    console.log(`   ✅ Tổng số activities: ${count}\n`);

    // Test 3: Tạo một test activity
    console.log("3. Tạo test activity...");
    const testActivity = await UserActivity.create({
      UserId: 1, // Thay bằng user ID thực tế nếu cần
      ActivityType: 'login',
      Description: 'Test activity từ script',
      Metadata: JSON.stringify({ test: true }),
      CreatedAt: new Date()
    });
    console.log(`   ✅ Đã tạo activity với ID: ${testActivity.Id}\n`);

    // Test 4: Lấy activities
    console.log("4. Lấy danh sách activities...");
    const activities = await UserActivity.findAll({
      limit: 5,
      order: [['CreatedAt', 'DESC']]
    });
    console.log(`   ✅ Lấy được ${activities.length} activities gần nhất:\n`);
    activities.forEach((act, idx) => {
      console.log(`   ${idx + 1}. [${act.ActivityType}] ${act.Description || '(no description)'} - ${act.CreatedAt}`);
    });

    console.log("\n✅ Tất cả tests đều thành công!");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Lỗi:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testActivityAPI();



