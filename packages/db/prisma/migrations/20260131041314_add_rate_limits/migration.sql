-- CreateEnum
CREATE TYPE "ViolationStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'BLOCKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "RateLimitViolation" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "resourceId" TEXT,
    "violationCount" INTEGER NOT NULL DEFAULT 1,
    "firstViolation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViolation" TIMESTAMP(3) NOT NULL,
    "lockoutUntil" TIMESTAMP(3),
    "status" "ViolationStatus" NOT NULL DEFAULT 'ACTIVE',
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitViolation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateLimitViolation_ipAddress_endpoint_resourceId_idx" ON "RateLimitViolation"("ipAddress", "endpoint", "resourceId");

-- CreateIndex
CREATE INDEX "RateLimitViolation_status_lockoutUntil_idx" ON "RateLimitViolation"("status", "lockoutUntil");

-- CreateIndex
CREATE INDEX "RateLimitViolation_lastViolation_idx" ON "RateLimitViolation"("lastViolation");

-- CreateIndex
CREATE INDEX "RateLimitViolation_createdAt_idx" ON "RateLimitViolation"("createdAt");
