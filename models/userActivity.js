const { DataTypes } = require('sequelize');

/**
 * Model để lưu lịch sử hoạt động của user
 * Bao gồm: kết nối serial, gửi/nhận lệnh, tạo/sửa/xóa scenario, etc.
 */
module.exports = (sequelize) => {
  const UserActivity = sequelize.define('UserActivity', {
    Id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      unique: true,
      comment: 'Unique identifier for the activity'
    },
    UserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'ID của user thực hiện hoạt động',
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    ActivityType: {
      type: DataTypes.ENUM(
        'serial_connect',
        'serial_disconnect',
        'command_sent',
        'command_received',
        'scenario_created',
        'scenario_updated',
        'scenario_deleted',
        'scenario_shared',
        'scenario_imported',
        'scenario_exported',
        'profile_updated',
        'login',
        'logout'
      ),
      allowNull: false,
      comment: 'Loại hoạt động'
    },
    Description: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Mô tả chi tiết hoạt động'
    },
    Metadata: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Dữ liệu bổ sung dạng JSON (scenarioId, command, baudrate, etc.)'
    },
    IpAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      comment: 'IP address của user (IPv4 hoặc IPv6)'
    },
    UserAgent: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'User agent của browser'
    },
    CreatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Thời gian thực hiện hoạt động'
    }
  }, {
    tableName: 'UserActivities',
    timestamps: false,
    comment: 'Bảng lưu lịch sử hoạt động của user',
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
    indexes: [
      {
        fields: ['UserId'],
        name: 'idx_user_activities_user_id'
      },
      {
        fields: ['ActivityType'],
        name: 'idx_user_activities_type'
      },
      {
        fields: ['CreatedAt'],
        name: 'idx_user_activities_created_at'
      },
      {
        fields: ['UserId', 'CreatedAt'],
        name: 'idx_user_activities_user_created'
      }
    ]
  });

  // Định nghĩa mối quan hệ
  UserActivity.associate = (models) => {
    UserActivity.belongsTo(models.User, {
      foreignKey: 'UserId',
      as: 'user'
    });
  };

  return UserActivity;
};


