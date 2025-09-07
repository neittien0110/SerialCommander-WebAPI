const { DataTypes } = require('sequelize');

/**
 * Defines the Sequelize model for the 'Scenarios' table.
 * @param {object} sequelize - The Sequelize connection instance.
 * @returns {object} The defined Scenario model.
 */
module.exports = (sequelize) => {
  const scenario = sequelize.define('Scenario', {
    Id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      unique: true,
      comment: 'Unique identifier for the scenario'
    },
    Name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'The name of the scenario'
    },
    Description: {
      type: DataTypes.STRING(1024),
      allowNull: true,
      comment: 'Mô tả về ý nghĩa của kịch bản'
    },    
    IsShared: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: '0 = private, 1 = public'
    },
    ShareCode: {
      type: DataTypes.STRING(12),
      allowNull: true,
      comment: 'The shareable code for public scenarios'
    },
    UserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'The user ID who created the scenario'
    },
    CreatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Automatically added by DB trigger'
    },
    ModifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Automatically added by DB trigger'
    },
    Baudrate: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Baudrate of the serial connection'
    },
    Parity: {
      type: DataTypes.STRING(5),
      defaultValue: 'none',
      allowNull: true,
      comment: 'Parity bit configuration (none, even, odd)'
    },
    StopBit: {
      type: DataTypes.TINYINT,
      defaultValue: 1,
      allowNull: true,
      comment: 'Number of stop bits (1 or 2)'
    },
    DataLength: {
      type: DataTypes.TINYINT,
      defaultValue: 8,
      allowNull: true,
      comment: 'Number of data bits (7 or 8)'
    },
    NewLine: {
      type: DataTypes.STRING(10),
      allowNull: true,
      comment: 'Kí tự xuống dòng. none | CRLF | LF'
    },    
    Banner1: {
      type: DataTypes.STRING(1024),
      allowNull: true,
      comment: 'Nội dung banner 1'
    },
    Banner2: {
      type: DataTypes.STRING(1024),
      allowNull: true,
      comment: 'Nội dung banner 2'
    },
    Content: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      comment: 'The JSON content of the scenario'
    }
  }, {
    tableName: 'Scenarios',
    timestamps: false,
    comment: 'Table to store user-created scenarios',
    charset: 'utf8mb4',
    collate: 'utf8mb4_0900_ai_ci',
  });

  return scenario;
};
