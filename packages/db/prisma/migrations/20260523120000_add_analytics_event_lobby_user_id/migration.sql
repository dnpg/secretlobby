-- Add lobbyUserId to AnalyticsEvent so identified visitors (post magic-link
-- or Google sign-in) can be aggregated per-LobbyUser. The lobby ingest path
-- (apps/lobby/app/routes/api.event.ts) stamps this column from the visitor's
-- session.lobbyUserIds[lobbyId] when present. Anonymous events stay null.

ALTER TABLE "AnalyticsEvent" ADD COLUMN "lobbyUserId" TEXT;

-- Composite index supporting the "tracks listened by this LobbyUser" count
-- used by the lobby-users admin route. Keep narrow — we only filter by
-- eventType='audio_play' for that aggregation.
CREATE INDEX "AnalyticsEvent_lobbyUserId_eventType_idx"
    ON "AnalyticsEvent"("lobbyUserId", "eventType");
