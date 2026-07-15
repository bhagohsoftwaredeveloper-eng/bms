-- AlterTable
ALTER TABLE `job_orders`
    ADD COLUMN `type` ENUM('SOFTWARE', 'CCTV', 'SIGNAGE') NOT NULL DEFAULT 'SOFTWARE',
    ADD COLUMN `camera_count` INTEGER NULL,
    ADD COLUMN `camera_rate` DECIMAL(12, 2) NULL,
    ADD COLUMN `labor_pct` DECIMAL(5, 2) NULL;
