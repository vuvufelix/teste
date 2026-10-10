-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('INFLUENCER', 'AGENCY', 'SUPER_ADMIN') NOT NULL DEFAULT 'INFLUENCER',
    `subscriptionStatus` ENUM('INACTIVE', 'ACTIVE', 'EXPIRED', 'CANCELED', 'TRIALING') NOT NULL DEFAULT 'INACTIVE',
    `trialEndsAt` DATETIME(3) NULL,
    `subscriptionEndsAt` DATETIME(3) NULL,
    `refreshTokenHash` VARCHAR(191) NULL,
    `resetPasswordTokenHash` VARCHAR(191) NULL,
    `resetPasswordExpiresAt` DATETIME(3) NULL,
    `planId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plans` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `priceUSD` DOUBLE NOT NULL,
    `priceAOA` DOUBLE NOT NULL,
    `priceBRL` DOUBLE NOT NULL,
    `durationInDays` INTEGER NOT NULL DEFAULT 30,
    `maxSocialNetworks` INTEGER NOT NULL,
    `maxProposalsPerMonth` INTEGER NOT NULL,
    `customDomainAllowed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `plans_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media_kits` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `bio` TEXT NULL,
    `profilePicture` VARCHAR(191) NULL,
    `coverImage` VARCHAR(191) NULL,
    `niche` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `isPublic` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `media_kits_userId_key`(`userId`),
    UNIQUE INDEX `media_kits_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `social_networks` (
    `id` VARCHAR(191) NOT NULL,
    `mediaKitId` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `profileUrl` VARCHAR(191) NULL,
    `followersCount` INTEGER NOT NULL DEFAULT 0,
    `engagementRate` DOUBLE NOT NULL DEFAULT 0.0,
    `avgImpressions` INTEGER NOT NULL DEFAULT 0,
    `lastSyncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `proposals` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `brandName` VARCHAR(191) NOT NULL,
    `brandEmail` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `totalAmount` DOUBLE NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `status` ENUM('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
    `validUntil` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `proposal_items` (
    `id` VARCHAR(191) NOT NULL,
    `proposalId` VARCHAR(191) NOT NULL,
    `deliverable` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unitPrice` DOUBLE NOT NULL,
    `totalPrice` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_orders` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `paymentMethod` ENUM('STRIPE_CARD', 'BANK_TRANSFER_AOA') NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `stripeSessionId` VARCHAR(191) NULL,
    `receiptUrl` VARCHAR(191) NULL,
    `bankReference` VARCHAR(191) NULL,
    `rejectionReason` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_kits` ADD CONSTRAINT `media_kits_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `social_networks` ADD CONSTRAINT `social_networks_mediaKitId_fkey` FOREIGN KEY (`mediaKitId`) REFERENCES `media_kits`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `proposals` ADD CONSTRAINT `proposals_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `proposal_items` ADD CONSTRAINT `proposal_items_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `proposals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_orders` ADD CONSTRAINT `payment_orders_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_orders` ADD CONSTRAINT `payment_orders_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
