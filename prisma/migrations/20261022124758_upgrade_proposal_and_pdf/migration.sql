-- DropForeignKey
ALTER TABLE `AgencyDelegation` DROP FOREIGN KEY `AgencyDelegation_agencyId_fkey`;

-- DropForeignKey
ALTER TABLE `AgencyDelegation` DROP FOREIGN KEY `AgencyDelegation_creatorId_fkey`;

-- AlterTable
ALTER TABLE `proposals` ADD COLUMN `cancellationTerms` TEXT NULL,
    ADD COLUMN `deliveryDeadline` VARCHAR(191) NULL,
    ADD COLUMN `includeMetrics` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `metricsSnapshot` JSON NULL,
    ADD COLUMN `paymentTerms` TEXT NULL,
    ADD COLUMN `revisionPolicy` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `AgencyDelegation` ADD CONSTRAINT `AgencyDelegation_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgencyDelegation` ADD CONSTRAINT `AgencyDelegation_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
