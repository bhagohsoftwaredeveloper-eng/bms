-- AlterTable
ALTER TABLE `users` MODIFY `role` ENUM('SUPER_ADMIN', 'INSTALLER', 'DEVELOPER', 'DESIGNER') NOT NULL;

-- CreateTable
CREATE TABLE `kpi_results` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `month` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `kpi_name` VARCHAR(191) NOT NULL,
    `actual_value` DECIMAL(10, 2) NOT NULL,
    `target_value` DECIMAL(10, 2) NOT NULL,
    `weight` DECIMAL(5, 2) NOT NULL,
    `score` DECIMAL(5, 2) NOT NULL,
    `is_manual` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `kpi_results_user_id_month_year_kpi_name_key`(`user_id`, `month`, `year`, `kpi_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `incentives` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `month` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `total_score` DECIMAL(5, 2) NOT NULL,
    `base_bonus` DECIMAL(12, 2) NOT NULL DEFAULT 10000,
    `bonus_amount` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'PAID') NOT NULL DEFAULT 'PENDING',
    `remarks` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `incentives_user_id_month_year_key`(`user_id`, `month`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `kpi_results` ADD CONSTRAINT `kpi_results_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `incentives` ADD CONSTRAINT `incentives_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
