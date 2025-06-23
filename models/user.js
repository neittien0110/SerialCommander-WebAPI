module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define("User", {
      username: { type: DataTypes.STRING, unique: true, allowNull: false },
      password: { type: DataTypes.STRING, allowNull: false },
      email: { type: DataTypes.STRING, unique: true, allowNull: false },
      role: { type: DataTypes.ENUM("admin", "user"), defaultValue: "user" }
    });
  
    User.associate = (models) => {
      User.hasMany(models.DeviceConfig, { foreignKey: "userId" });
    };
  
    return User;
  };
  