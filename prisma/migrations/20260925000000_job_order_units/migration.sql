-- One row per computer on a SOFTWARE job order, plus the cloud subscription total.
CREATE TABLE `job_order_units` (
    `id` VARCHAR(191) NOT NULL,
    `job_order_id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `product_id` VARCHAR(191) NULL,
    `price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `cloud_enabled` BOOLEAN NOT NULL DEFAULT false,
    `cloud_monthly_rate` DECIMAL(12, 2) NULL,
    `cloud_months` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `job_order_units_job_order_id_idx`(`job_order_id`),
    INDEX `job_order_units_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `job_orders` ADD COLUMN `cloud_total` DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE `job_order_items` ADD COLUMN `unit_id` VARCHAR(191) NULL;
CREATE INDEX `job_order_items_unit_id_idx` ON `job_order_items`(`unit_id`);

ALTER TABLE `job_order_units` ADD CONSTRAINT `job_order_units_job_order_id_fkey` FOREIGN KEY (`job_order_id`) REFERENCES `job_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `job_order_units` ADD CONSTRAINT `job_order_units_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `software_products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `job_order_items` ADD CONSTRAINT `job_order_items_unit_id_fkey` FOREIGN KEY (`unit_id`) REFERENCES `job_order_units`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
