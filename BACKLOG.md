Open follow-ups for later phases

  - Phase-2 dashboard — point Metabase or Apache Superset at the
  AnalyticsEvent table; no analytics-stack ops cost. When customer-facing,
  swap client-supplied lobbyId validation for server tenant resolution.
  - Phase-3 cold archive — S3 export job for events older than your eventual
  retention cutoff. You said "keep all for now," so this is purely a future
  task.
  - Cache the lobby→account lookup — currently one Prisma call per event.
  Cheap, but trivially LRU-cacheable if volume grows.
  - MaxMind GeoLite2 fallback — only matters if you ever sit behind a
  (e.g., schema/migration, then helper, then ingest+wiring)?