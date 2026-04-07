-- Migration: Add Google OAuth fields to Users table
-- Run this SQL manually or temporarily change sequelize.sync({ alter: true }) in server.js

-- Add googleId column (nullable, unique)
ALTER TABLE `Users` ADD COLUMN `googleId` VARCHAR(255) NULL UNIQUE;

-- Add provider column (enum: 'local' or 'google', default: 'local')
ALTER TABLE `Users` ADD COLUMN `provider` ENUM('local', 'google') DEFAULT 'local';

-- Make username and password nullable (for Google OAuth users)
ALTER TABLE `Users` MODIFY COLUMN `username` VARCHAR(255) NULL;
ALTER TABLE `Users` MODIFY COLUMN `password` VARCHAR(255) NULL;





