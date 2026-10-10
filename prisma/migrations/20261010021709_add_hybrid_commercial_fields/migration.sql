-- AlterTable
ALTER TABLE `social_networks` ADD COLUMN `pricePerPost` DOUBLE NOT NULL DEFAULT 0.0,
    ADD COLUMN `targetAudience` VARCHAR(191) NULL;
