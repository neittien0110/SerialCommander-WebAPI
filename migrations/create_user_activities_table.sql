-- Migration: Tạo bảng UserActivities để lưu lịch sử hoạt động của user
-- Created: 2025-01-XX

CREATE TABLE IF NOT EXISTS `UserActivities` (
  `Id` CHAR(36) NOT NULL PRIMARY KEY COMMENT 'UUID identifier',
  `UserId` INT NOT NULL COMMENT 'ID của user thực hiện hoạt động',
  `ActivityType` ENUM(
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
  ) NOT NULL COMMENT 'Loại hoạt động',
  `Description` VARCHAR(500) NULL COMMENT 'Mô tả chi tiết hoạt động',
  `Metadata` TEXT NULL COMMENT 'Dữ liệu bổ sung dạng JSON',
  `IpAddress` VARCHAR(45) NULL COMMENT 'IP address của user',
  `UserAgent` VARCHAR(500) NULL COMMENT 'User agent của browser',
  `CreatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời gian thực hiện',
  
  INDEX `idx_user_activities_user_id` (`UserId`),
  INDEX `idx_user_activities_type` (`ActivityType`),
  INDEX `idx_user_activities_created_at` (`CreatedAt`),
  INDEX `idx_user_activities_user_created` (`UserId`, `CreatedAt`),
  
  CONSTRAINT `fk_user_activities_user` 
    FOREIGN KEY (`UserId`) 
    REFERENCES `Users` (`id`) 
    ON DELETE CASCADE 
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Bảng lưu lịch sử hoạt động của user';




