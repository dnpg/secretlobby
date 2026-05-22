-- AnalyticsEvent: first-party lobby event ingest. Phase-1 lives in the public
-- schema for the same operational reasons the rest of the app does; if/when
-- we want hard isolation we can move it into an `analytics` schema in a
-- dedicated migration without changing any query code.

CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientTs" TIMESTAMP(3),
    "accountId" TEXT,
    "lobbyId" TEXT,
    "sessionId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "trackId" TEXT,
    "path" TEXT,
    "referrer" TEXT,
    "userAgent" TEXT,
    "country" TEXT,
    "properties" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnalyticsEvent_accountId_occurredAt_idx"
    ON "AnalyticsEvent"("accountId", "occurredAt");

CREATE INDEX "AnalyticsEvent_lobbyId_eventType_occurredAt_idx"
    ON "AnalyticsEvent"("lobbyId", "eventType", "occurredAt");

CREATE INDEX "AnalyticsEvent_sessionId_idx"
    ON "AnalyticsEvent"("sessionId");

CREATE INDEX "AnalyticsEvent_visitorId_idx"
    ON "AnalyticsEvent"("visitorId");

CREATE INDEX "AnalyticsEvent_occurredAt_idx"
    ON "AnalyticsEvent"("occurredAt");
