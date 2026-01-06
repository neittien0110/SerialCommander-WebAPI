"use strict"; // Chế độ nghiêm ngặt của JavaScript, giúp bắt lỗi cú pháp và runtime tốt hơn.

const fs = require("fs"); // Import module 'fs' (File System) của Node.js để làm việc với hệ thống file.
const path = require("path"); // Import module 'path' của Node.js để làm việc với đường dẫn file và thư mục.
const Sequelize = require("sequelize"); // Import thư viện Sequelize, một ORM (Object-Relational Mapper) cho Node.js.
const process = require("process"); // Import module 'process' của Node.js để tương tác với các tiến trình của Node.js và biến môi trường.

const basename = path.basename(__filename); // Lấy tên file hiện tại (ví dụ: 'index.js' nếu đây là file index.js).
const env = process.env.DATABASE_ENV || "development"; // Xác định môi trường hiện tại. Ưu tiên biến môi trường DATABASE_ENV, nếu không có thì mặc định là 'development'.
const config = require(__dirname + "/../configs/database.js")[env]; // Tải cấu hình database từ file 'database.js' trong thư mục 'configs' dựa trên môi trường đã xác định.
const db = {}; // Khởi tạo một đối tượng rỗng để chứa tất cả các models đã được tải và các instance của Sequelize.

let sequelize; // Khai báo biến 'sequelize', sẽ là instance của Sequelize kết nối tới database.

// Kiểm tra xem cấu hình có sử dụng biến môi trường cho chuỗi kết nối không.
if (config.use_env_variable) {
  // Nếu có, sử dụng biến môi trường để tạo instance Sequelize.
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  // Nếu không, sử dụng các thông tin cấu hình từ file database.js để tạo instance Sequelize.
  sequelize = new Sequelize(
    config.database, // Tên database
    config.username, // Tên người dùng database
    config.password, // Mật khẩu database
    {
      host: config.host, // Địa chỉ host của database
      port: config.port, // Cổng kết nối database
      dialect: config.dialect, // Loại database (ví dụ: 'mysql', 'postgres', 'sqlite')
      dialectOptions: config.dialectOptions, // Các tùy chọn cụ thể cho dialect
      logging: true, // Bật logging cho Sequelize để hiển thị các câu lệnh SQL được thực thi. Có thể đặt là 'false' để tắt.
    }
  );
}

// Đọc tất cả các file trong thư mục hiện tại.
fs.readdirSync(__dirname)
  // Lọc ra các file chỉ định:
  .filter((file) => {
    return (
      file.indexOf(".") !== 0 && // Bỏ qua các file ẩn (bắt đầu bằng '.')
      file !== basename && // Bỏ qua chính file hiện tại (để tránh lặp vô hạn)
      file.slice(-3) === ".js" && // Chỉ lấy các file có đuôi '.js'
      file.indexOf(".test.js") === -1 // Bỏ qua các file kiểm thử (ví dụ: *.test.js)
    );
  })
  // Với mỗi file model hợp lệ tìm thấy:
  .forEach((file) => {
    // Import model từ file đó. Mỗi file model trả về một hàm nhận 'sequelize' và 'DataTypes' làm đối số.
    const model = require(path.join(__dirname, file))(
      sequelize, // Truyền instance sequelize
      Sequelize.DataTypes // Truyền các kiểu dữ liệu của Sequelize
    );
    // Lưu model đã được định nghĩa vào đối tượng 'db' với tên model làm key.
    // Ví dụ: db.User = User_model_object
    db[model.name] = model;
  });

// Lặp qua tất cả các models đã được tải vào đối tượng 'db'.
Object.keys(db).forEach((modelName) => {
  // Kiểm tra xem model đó có phương thức 'associate' được định nghĩa hay không.
  if (db[modelName].associate) {
    // Nếu có, gọi phương thức 'associate' và truyền toàn bộ đối tượng 'db'
    // để các models có thể định nghĩa mối quan hệ giữa chúng.
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize; // Gán instance 'sequelize' vào đối tượng 'db' để dễ dàng truy cập.
db.Sequelize = Sequelize; // Gán lớp 'Sequelize' vào đối tượng 'db' để dễ dàng truy cập các hằng số và kiểu dữ liệu của Sequelize.

module.exports = db; // Xuất đối tượng 'db' chứa tất cả các models, instance sequelize, và lớp Sequelize để sử dụng ở các phần khác của ứng dụng.