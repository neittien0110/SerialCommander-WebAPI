module.exports = (sequelize, DataTypes) => {
  const PasswordReset = sequelize.define("PasswordReset", {
    UserId: {
      type: DataTypes.INTEGER,
      allowNull: true, // Cho phép null vì migration có thể chưa chạy
      comment: "FK to Users.id to avoid orphan reset codes",
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isEmail: true,
      },
    },
    resetCode: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    used: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  });

  // Định nghĩa mối quan hệ với User (optional)
  PasswordReset.associate = (models) => {
    if (models.User) {
      PasswordReset.belongsTo(models.User, {
        foreignKey: "UserId",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
    }
  };

  return PasswordReset;
};

