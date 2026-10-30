-- Additive: fixed installer labor amount for CCTV / Signage job orders.
ALTER TABLE `job_orders` ADD COLUMN `labor_amount` DECIMAL(12, 2) NULL;

-- Backfill from the old price-derived formulas so existing orders keep their labor pay.
UPDATE `job_orders` SET `labor_amount` = ROUND(COALESCE(`camera_count`, 0) * COALESCE(`camera_rate`, 0), 2) WHERE `type` = 'CCTV';
UPDATE `job_orders` SET `labor_amount` = ROUND(`sale_price` * COALESCE(`labor_pct`, 20) / 100, 2) WHERE `type` = 'SIGNAGE';
