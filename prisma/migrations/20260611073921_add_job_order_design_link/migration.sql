-- DropForeignKey
ALTER TABLE `job_orders` DROP FOREIGN KEY `job_orders_job_id_fkey`;

-- DropForeignKey
ALTER TABLE `job_orders` DROP FOREIGN KEY `job_orders_product_id_fkey`;

-- AlterTable
ALTER TABLE `job_orders`
    ADD COLUMN `design_job_id` VARCHAR(191) NULL,
    ADD COLUMN `type` ENUM('SOFTWARE', 'DESIGN') NOT NULL DEFAULT 'SOFTWARE',
    MODIFY `job_id` VARCHAR(191) NULL,
    MODIFY `product_id` VARCHAR(191) NULL,
    MODIFY `status` ENUM('DRAFT', 'FINALIZED', 'ON_GOING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT';

-- CreateIndex
CREATE UNIQUE INDEX `job_orders_design_job_id_key` ON `job_orders`(`design_job_id`);

-- AddForeignKey
ALTER TABLE `job_orders` ADD CONSTRAINT `job_orders_job_id_fkey` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_orders` ADD CONSTRAINT `job_orders_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `software_products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_orders` ADD CONSTRAINT `job_orders_design_job_id_fkey` FOREIGN KEY (`design_job_id`) REFERENCES `design_jobs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
