-- AlterTable
ALTER TABLE `machine_inks`
    MODIFY `max_capacity` DOUBLE NOT NULL,
    MODIFY `current_usage` DOUBLE NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `ink_usage_logs`
    MODIFY `amount_used` DOUBLE NOT NULL;

-- AlterTable
ALTER TABLE `ink_refill_logs`
    MODIFY `previous_usage` DOUBLE NOT NULL,
    MODIFY `new_usage` DOUBLE NOT NULL;
