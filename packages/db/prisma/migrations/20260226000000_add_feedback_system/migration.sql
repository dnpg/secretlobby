-- AlterTable: Update supportEmail default to .co
ALTER TABLE "SystemSettings" ALTER COLUMN "supportEmail" SET DEFAULT 'support@secretlobby.co';

-- AlterTable: Add feedbackNotificationEmail
ALTER TABLE "SystemSettings" ADD COLUMN "feedbackNotificationEmail" TEXT;

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('BUG_REPORT', 'FEATURE_REQUEST', 'GENERAL');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'READ', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackAttachment" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feedback_accountId_idx" ON "Feedback"("accountId");

-- CreateIndex
CREATE INDEX "Feedback_status_idx" ON "Feedback"("status");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE INDEX "FeedbackAttachment_feedbackId_idx" ON "FeedbackAttachment"("feedbackId");

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAttachment" ADD CONSTRAINT "FeedbackAttachment_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
