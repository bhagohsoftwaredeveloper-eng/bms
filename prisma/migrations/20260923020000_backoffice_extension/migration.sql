-- SOFTWARE job orders can flag that the install includes setting up the POS
-- backoffice extension, which pays the installer a flat bonus on top of the
-- usual per-computer installation rate.
ALTER TABLE `job_orders` ADD COLUMN `includes_backoffice_extension` BOOLEAN NOT NULL DEFAULT false;

-- Singleton settings row (id is always 1) for the flat bonus amount.
CREATE TABLE `backoffice_extension_rate` (
    `id` INTEGER NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
