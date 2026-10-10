/*
  Warnings:

  - You are about to drop the column `smtpEmail` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `smtpPass` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `users` DROP COLUMN `smtpEmail`,
    DROP COLUMN `smtpPass`;
