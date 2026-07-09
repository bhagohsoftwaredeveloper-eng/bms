-- CreateTable
CREATE TABLE `download_leads` (
    `id` VARCHAR(191) NOT NULL,
    `company_name` VARCHAR(191) NOT NULL,
    `contact_person` VARCHAR(191) NOT NULL,
    `contact_no` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `platform` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
