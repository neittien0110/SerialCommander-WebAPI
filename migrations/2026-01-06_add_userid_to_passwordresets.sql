-- Migration: add UserId FK to PasswordResets to avoid orphan reset codes
-- Run manually or via migration runner

ALTER TABLE `PasswordResets`
  ADD COLUMN `UserId` INT NULL AFTER `email`,
  ADD INDEX `idx_password_resets_user_id` (`UserId`),
  ADD CONSTRAINT `fk_password_resets_user_id`
    FOREIGN KEY (`UserId`) REFERENCES `Users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Optional: backfill UserId for existing rows (if any) based on email
-- UPDATE PasswordResets pr
-- JOIN Users u ON pr.email = u.email
-- SET pr.UserId = u.id
-- WHERE pr.UserId IS NULL;


