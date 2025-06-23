// models/Component.js
module.exports = (sequelize, DataTypes) => {
  const Component = sequelize.define("Component", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM("text", "dropdown", "button", "para"),
      allowNull: false
    },
    list: {
      type: DataTypes.TEXT // Lưu dạng "A;B;C" nếu là dropdown
    },
    defaultValue: {
      type: DataTypes.TEXT
    }
  });

  Component.associate = (models) => {
    Component.belongsTo(models.DeviceConfig, {
      foreignKey: "configId",
      as: "config"
    });
  };

  return Component;
};
