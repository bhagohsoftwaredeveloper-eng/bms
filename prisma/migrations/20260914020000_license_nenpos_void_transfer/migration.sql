-- Secure void / transfer audit trail (spec: 2026-09-11-license-nenpos-void-transfer)
ALTER TABLE `licenses` ADD COLUMN `voided_at` DATETIME NULL;
ALTER TABLE `licenses` ADD COLUMN `voided_by_id` VARCHAR(191) NULL;
ALTER TABLE `licenses` ADD COLUMN `void_reason` TEXT NULL;
ALTER TABLE `licenses` ADD COLUMN `transferred_to_nenpos_client_id` VARCHAR(191) NULL;

ALTER TABLE `nenpos_clients` ADD COLUMN `voided_at` DATETIME NULL;
ALTER TABLE `nenpos_clients` ADD COLUMN `voided_by_id` VARCHAR(191) NULL;
ALTER TABLE `nenpos_clients` ADD COLUMN `void_reason` TEXT NULL;
ALTER TABLE `nenpos_clients` ADD COLUMN `transferred_to_license_id` VARCHAR(191) NULL;
