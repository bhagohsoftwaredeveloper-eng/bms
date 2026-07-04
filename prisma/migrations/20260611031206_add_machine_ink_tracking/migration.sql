-- CreateTable
CREATE TABLE `printer_machines` (
    `id` VARCHAR(191) NOT NULL,
    `model` ENUM('TS100_1600_SUBLIMATION', 'JV100_160', 'UCJV300_160') NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `printer_machines_label_key`(`label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `machine_inks` (
    `id` VARCHAR(191) NOT NULL,
    `machine_id` VARCHAR(191) NOT NULL,
    `ink_color` ENUM('BLACK', 'CYAN', 'MAGENTA', 'YELLOW', 'CLEAR', 'WHITE') NOT NULL,
    `max_capacity` INTEGER NOT NULL,
    `current_usage` INTEGER NOT NULL DEFAULT 0,
    `last_refill_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `machine_inks_machine_id_ink_color_key`(`machine_id`, `ink_color`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ink_usage_logs` (
    `id` VARCHAR(191) NOT NULL,
    `machine_id` VARCHAR(191) NOT NULL,
    `machine_ink_id` VARCHAR(191) NOT NULL,
    `amount_used` INTEGER NOT NULL,
    `job_reference` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `recorded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `recorded_by` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ink_refill_logs` (
    `id` VARCHAR(191) NOT NULL,
    `machine_id` VARCHAR(191) NOT NULL,
    `machine_ink_id` VARCHAR(191) NOT NULL,
    `previous_usage` INTEGER NOT NULL,
    `new_usage` INTEGER NOT NULL,
    `refill_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `refill_by` VARCHAR(191) NULL,
    `notes` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `machine_inks` ADD CONSTRAINT `machine_inks_machine_id_fkey` FOREIGN KEY (`machine_id`) REFERENCES `printer_machines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ink_usage_logs` ADD CONSTRAINT `ink_usage_logs_machine_id_fkey` FOREIGN KEY (`machine_id`) REFERENCES `printer_machines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ink_usage_logs` ADD CONSTRAINT `ink_usage_logs_machine_ink_id_fkey` FOREIGN KEY (`machine_ink_id`) REFERENCES `machine_inks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ink_refill_logs` ADD CONSTRAINT `ink_refill_logs_machine_id_fkey` FOREIGN KEY (`machine_id`) REFERENCES `printer_machines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ink_refill_logs` ADD CONSTRAINT `ink_refill_logs_machine_ink_id_fkey` FOREIGN KEY (`machine_ink_id`) REFERENCES `machine_inks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
