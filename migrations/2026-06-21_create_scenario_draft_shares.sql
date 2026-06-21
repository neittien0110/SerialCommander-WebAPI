CREATE TABLE IF NOT EXISTS `ScenarioDraftShares` (
  `Code` VARCHAR(16) NOT NULL,
  `Content` LONGTEXT NOT NULL,
  `CreatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ExpiresAt` DATETIME NOT NULL,
  PRIMARY KEY (`Code`),
  KEY `idx_scenario_draft_shares_expires_at` (`ExpiresAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
