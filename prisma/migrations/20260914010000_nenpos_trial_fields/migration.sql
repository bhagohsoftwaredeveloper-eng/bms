-- Trial licensing support for NENPOS clients
ALTER TABLE `nenpos_clients` ADD COLUMN `is_trial` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `nenpos_clients` ADD COLUMN `install_date` DATETIME NULL;
ALTER TABLE `nenpos_clients` ADD COLUMN `trial_days` INTEGER NOT NULL DEFAULT 30;
