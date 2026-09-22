-- Every installer assigned to a job (includes the primary jobs.installer_id).
-- Lets the installation incentive be split equally when 2+ installers work
-- the same job. Additive only — see project notes on DB drift.

-- CreateTable
CREATE TABLE `job_installers` (
    `id` VARCHAR(191) NOT NULL,
    `job_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `job_installers_job_id_user_id_key`(`job_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `job_installers` ADD CONSTRAINT `job_installers_job_id_fkey` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_installers` ADD CONSTRAINT `job_installers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing job that already has a primary installer gets one
-- job_installers row for that installer, so legacy jobs keep working exactly
-- as before (a "team of one" produces no split).
INSERT INTO `job_installers` (`id`, `job_id`, `user_id`, `created_at`)
SELECT UUID(), `id`, `installer_id`, NOW(3)
FROM `jobs`
WHERE `installer_id` IS NOT NULL;
