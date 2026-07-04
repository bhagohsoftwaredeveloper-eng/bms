-- CreateTable
CREATE TABLE `design_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `client_name` VARCHAR(191) NULL,
    `designer_id` VARCHAR(191) NOT NULL,
    `operator_id` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'ASSIGNED', 'ON_GOING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `due_date` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `design_job_updates` (
    `id` VARCHAR(191) NOT NULL,
    `design_job_id` VARCHAR(191) NOT NULL,
    `author_id` VARCHAR(191) NOT NULL,
    `message` TEXT NULL,
    `status` ENUM('PENDING', 'ASSIGNED', 'ON_GOING', 'COMPLETED', 'CANCELLED') NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `design_jobs` ADD CONSTRAINT `design_jobs_designer_id_fkey` FOREIGN KEY (`designer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `design_jobs` ADD CONSTRAINT `design_jobs_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `design_job_updates` ADD CONSTRAINT `design_job_updates_design_job_id_fkey` FOREIGN KEY (`design_job_id`) REFERENCES `design_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `design_job_updates` ADD CONSTRAINT `design_job_updates_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
