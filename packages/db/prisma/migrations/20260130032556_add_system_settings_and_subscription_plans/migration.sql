-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabledGateways" TEXT[] DEFAULT ARRAY['stripe']::TEXT[],
    "defaultGateway" TEXT NOT NULL DEFAULT 'stripe',
    "platformName" TEXT NOT NULL DEFAULT 'SecretLobby',
    "supportEmail" TEXT NOT NULL DEFAULT 'support@secretlobby.io',
    "allowSignups" BOOLEAN NOT NULL DEFAULT true,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "priceMonthly" INTEGER NOT NULL DEFAULT 0,
    "priceYearly" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "stripePriceMonthly" TEXT,
    "stripePriceYearly" TEXT,
    "paypalPlanMonthly" TEXT,
    "paypalPlanYearly" TEXT,
    "features" JSONB NOT NULL DEFAULT '[]',
    "maxSongs" INTEGER NOT NULL DEFAULT 5,
    "maxLobbies" INTEGER NOT NULL DEFAULT 1,
    "maxStorage" INTEGER NOT NULL DEFAULT 100,
    "customDomain" BOOLEAN NOT NULL DEFAULT false,
    "apiAccess" BOOLEAN NOT NULL DEFAULT false,
    "highlighted" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_slug_key" ON "SubscriptionPlan"("slug");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_slug_idx" ON "SubscriptionPlan"("slug");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_isActive_position_idx" ON "SubscriptionPlan"("isActive", "position");
