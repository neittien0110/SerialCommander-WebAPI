-- Migration: add unique index for Users.email to ensure no duplicate accounts
-- Run manually or via migration runner

-- Create unique index (MySQL)
ALTER TABLE `Users`
  ADD UNIQUE INDEX `ux_users_email` (`email`);


