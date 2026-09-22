-- AlterTable
ALTER TABLE `earnings` ADD COLUMN `note` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `installation_rates` (
    `location` ENUM('INSIDE_TAGUM', 'OUTSIDE_TAGUM') NOT NULL,
    `base_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `extra_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`location`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `installation_rates` (`location`, `base_amount`, `extra_amount`, `updated_at`) VALUES
    ('INSIDE_TAGUM', 0, 0, CURRENT_TIMESTAMP(3)),
    ('OUTSIDE_TAGUM', 0, 0, CURRENT_TIMESTAMP(3));
