---
sidebar_position: 7
slug: /packages/storage
---

# Storage

The storage package provides AWS S3 integration for file uploads and retrieval.

## Overview

- **Package**: `@secretlobby/storage`
- **Technologies**: AWS SDK for S3

## Usage

### Upload File

```typescript
import { uploadFile } from '@secretlobby/storage';

const result = await uploadFile({
  file: buffer,
  key: 'uploads/image.jpg',
  contentType: 'image/jpeg',
});

console.log(result.url); // Public URL of uploaded file
```

### Upload from Stream

```typescript
import { uploadStream } from '@secretlobby/storage';

const result = await uploadStream({
  stream: readableStream,
  key: 'uploads/video.mp4',
  contentType: 'video/mp4',
});
```

### Get File

```typescript
import { getFile } from '@secretlobby/storage';

const file = await getFile('uploads/image.jpg');
// Returns a readable stream
```

### Get Signed URL

```typescript
import { getSignedUrl } from '@secretlobby/storage';

// Generate a signed URL for private files
const url = await getSignedUrl('private/document.pdf', {
  expiresIn: 3600, // 1 hour
});
```

### Delete File

```typescript
import { deleteFile } from '@secretlobby/storage';

await deleteFile('uploads/old-image.jpg');
```

### List Files

```typescript
import { listFiles } from '@secretlobby/storage';

const files = await listFiles('uploads/');
// Returns array of file keys
```

## File Organization

Files are organized by type:

```
bucket/
├── uploads/         # User uploads
├── media/           # Processed media files
│   ├── audio/       # Audio files
│   ├── video/       # Video files
│   └── images/      # Image files
├── hls/             # HLS streaming segments
└── private/         # Private files
```

## Configuration

Configure S3 via environment variables:

```bash
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
S3_BUCKET=secretlobby-storage
S3_CDN_URL=https://cdn.secretlobby.io  # Optional CDN
```

## Local Development

For local development, you can use LocalStack or MinIO:

```bash
# Using LocalStack
AWS_ENDPOINT=http://localhost:4566
S3_BUCKET=local-bucket
```
