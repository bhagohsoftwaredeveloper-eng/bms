-- CreateTable
CREATE TABLE `user_role_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'INSTALLER', 'DEVELOPER', 'DESIGNER', 'MACHINE_OPERATOR', 'LIAISON', 'ADMIN_STAFF') NOT NULL,

    UNIQUE INDEX `user_role_assignments_user_id_role_key`(`user_id`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_role_assignments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
