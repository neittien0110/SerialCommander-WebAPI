// models/DeviceConfig.js
module.exports = (sequelize, DataTypes) => {
  const DeviceConfig = sequelize.define("DeviceConfig", {
   id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    delayTime: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    baudrate: {
      type: DataTypes.STRING,
      defaultValue: "115200"
    },
    leftBanner: {
      type: DataTypes.STRING
    },
    rightBanner: {
      type: DataTypes.STRING
    },
    isShared: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    shareCode: {
      type: DataTypes.STRING
    }
  });

  DeviceConfig.associate = (models) => {
    DeviceConfig.belongsTo(models.User, {
      foreignKey: "userId",
      as: "user"
    });
    DeviceConfig.hasMany(models.Component, {
      foreignKey: "configId",
      as: "components",
      onDelete: "CASCADE"
    });
  };

  return DeviceConfig;
};
