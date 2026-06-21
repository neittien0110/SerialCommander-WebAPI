const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const scenarioDraftShare = sequelize.define(
    "ScenarioDraftShare",
    {
      Code: {
        type: DataTypes.STRING(16),
        primaryKey: true,
      },
      Content: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
      },
      CreatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      ExpiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      tableName: "ScenarioDraftShares",
      timestamps: false,
      charset: "utf8mb4",
      collate: "utf8mb4_0900_ai_ci",
    }
  );

  return scenarioDraftShare;
};
