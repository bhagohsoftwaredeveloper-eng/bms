-- Tracks how many computers/terminals a client business runs, independent of
-- how many licenses have actually been issued to them
ALTER TABLE `clients` ADD COLUMN `computer_count` INTEGER NULL;
