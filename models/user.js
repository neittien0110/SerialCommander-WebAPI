module.exports = (sequelize, DataTypes) => {
  // Định nghĩa model 'User' sử dụng sequelize.
  // 'sequelize' là instance kết nối đến database.
  // 'DataTypes' chứa các kiểu dữ liệu có sẵn trong Sequelize (ví dụ: STRING, INTEGER, ENUM).
  const User = sequelize.define("User", {
    // Định nghĩa cột 'username'
    username: { type: DataTypes.STRING, unique: true, allowNull: false },
      password: { type: DataTypes.STRING, allowNull: false },
    // Định nghĩa cột 'email'
    email: { type: DataTypes.STRING, unique: false, allowNull: false },
    // Định nghĩa cột 'role' (vai trò của người dùng)
    role: { type: DataTypes.ENUM("admin", "user"), defaultValue: "user" }
    });

  // Định nghĩa mối quan hệ giữa các models. Thiết lập quan hệ 1-n
  User.associate = (models) => {
    // Một User có nhiều DeviceConfig (một người dùng có thể sở hữu nhiều cấu hình thiết bị).
    // 'models.DeviceConfig' là model 'DeviceConfig' đã được định nghĩa ở nơi khác.
    // 'foreignKey: "userId"' chỉ ra rằng cột 'userId' trong bảng 'DeviceConfig' sẽ là khóa ngoại liên kết với 'User'.
    User.hasMany(models.DeviceConfig, {
      foreignKey: "userId",
    });
  };

  // Trả về model User đã được định nghĩa
  return User;
};