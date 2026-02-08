---
sidebar_position: 3
slug: /apps/lobby
---

# Lobby App

The lobby application handles user-facing streaming pages, accessible via subdomains like `*.secretlobby.co`.

## Overview

- **Package**: `@secretlobby/lobby`
- **Port**: 3002
- **Production URL**: https://*.secretlobby.co (subdomains)

## Features

- HLS (HTTP Live Streaming) video playback
- MP3 audio streaming
- Rate limiting for API protection
- Custom subdomain routing

## Routes

### Pages
| Route | File | Description |
|-------|------|-------------|
| `/` | `_index.tsx` | Main lobby page |

### Streaming API
| Route | File | Description |
|-------|------|-------------|
| `/api/hls/:trackId/playlist` | `api.hls.$trackId.playlist.tsx` | HLS playlist manifest |
| `/api/hls/:trackId/segment/:filename` | `api.hls.$trackId.segment.$filename.tsx` | HLS video segments |
| `/api/stream-mp3/:trackId` | `api.stream-mp3.$trackId.tsx` | MP3 audio streaming |

### Admin API
| Route | File | Description |
|-------|------|-------------|
| `/api/clear-rate-limit/:ipAddress` | `api.clear-rate-limit.$ipAddress.ts` | Clear rate limit for IP |

## Streaming Implementation

### HLS Streaming

The lobby uses HLS.js for adaptive bitrate streaming:

```typescript
import Hls from 'hls.js';

// Initialize HLS player
if (Hls.isSupported()) {
  const hls = new Hls();
  hls.loadSource(`/api/hls/${trackId}/playlist`);
  hls.attachMedia(videoElement);
}
```

### MP3 Streaming

Direct MP3 streaming for audio-only playback:

```typescript
// Simple audio element with streaming
<audio src={`/api/stream-mp3/${trackId}`} controls />
```

## Rate Limiting

The lobby implements rate limiting to prevent abuse:
- Configurable limits per IP address
- Admin endpoint to clear rate limits when needed

## Dependencies

This app depends on the following packages:
- `@secretlobby/auth` - Authentication
- `@secretlobby/db` - Database access
- `@secretlobby/logger` - Logging
- `@secretlobby/storage` - S3 storage for media files
- `@secretlobby/ui` - Shared UI components

## Development

```bash
# Run lobby app only
pnpm dev --filter @secretlobby/lobby

# Build for production
pnpm build --filter @secretlobby/lobby
```

## Subdomain Configuration

In development, you may need to configure local DNS or use a tool like `lvh.me` to test subdomain routing:

```bash
# Example: test.lvh.me:3002 will route to localhost:3002
```
