-- CreateTable
CREATE TABLE `kpi_definitions` (
    `id` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'INSTALLER', 'DEVELOPER', 'DESIGNER', 'MACHINE_OPERATOR', 'LIAISON', 'ADMIN_STAFF') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `weight` DECIMAL(5, 2) NOT NULL,
    `target` DECIMAL(10, 2) NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `auto` BOOLEAN NOT NULL DEFAULT false,
    `is_custom` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `kpi_definitions_role_name_key`(`role`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
