-- CreateTable
CREATE TABLE `nenpos_clients` (
    `id` VARCHAR(191) NOT NULL,
    `client_id` VARCHAR(191) NOT NULL,
    `client_name` VARCHAR(191) NOT NULL,
    `start_date` DATETIME(3) NULL,
    `expiry_date` DATETIME(3) NULL,
    `license` VARCHAR(191) NULL,
    `status` VARCHAR(191) NULL DEFAULT 'ACTIVE',
    `installer` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `address` TEXT NULL,
    `uploaded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `uploaded_by` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
