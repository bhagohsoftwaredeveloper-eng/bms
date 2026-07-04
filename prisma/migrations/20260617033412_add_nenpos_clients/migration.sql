/*
  Warnings:

  - You are about to drop the column `uploaded_at` on the `nenpos_clients` table. All the data in the column will be lost.
  - You are about to drop the column `uploaded_by` on the `nenpos_clients` table. All the data in the column will be lost.
  - Added the required column `updated_at` to the `nenpos_clients` table without a default value. This is not possible if the table is not empty.
  - Made the column `status` on table `nenpos_clients` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `nenpos_clients` DROP COLUMN `uploaded_at`,
    DROP COLUMN `uploaded_by`,
    ADD COLUMN `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `updated_at` DATETIME(3) NOT NULL,
    MODIFY `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE';
