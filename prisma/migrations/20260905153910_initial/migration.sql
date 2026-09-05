-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('INFLUENCER', 'AGENCY', 'SUPER_ADMIN') NOT NULL DEFAULT 'INFLUENCER',
    `subscriptionStatus` ENUM('TRIALING', 'ACTIVE', 'CANCELED', 'PAST_DUE', 'EXPIRED') NOT NULL DEFAULT 'TRIALING',
    `trialEndsAt` DATETIME(3) NOT NULL,
    `refreshTokenHash` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
