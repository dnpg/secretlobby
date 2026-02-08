---
sidebar_position: 1
slug: /packages/ui
---

# UI Components

The UI package provides a shared component library used across all SecretLobby applications.

## Overview

- **Package**: `@secretlobby/ui`
- **Technologies**: React 19, Tailwind CSS 4, Radix UI

## Installation

This package is automatically available to all apps in the monorepo:

```typescript
import { Button, Dialog, Input } from '@secretlobby/ui';
```

## Components

### Radix UI Components

The package wraps and exports Radix UI primitives with custom styling:

- **Dialog** - Modal dialogs
- **Dropdown Menu** - Dropdown menus
- **Select** - Select inputs
- **Tooltip** - Tooltips
- **Toast** - Toast notifications

### Rich Text Editor

Integrates Tiptap for rich text editing:

```typescript
import { RichTextEditor } from '@secretlobby/ui';

<RichTextEditor
  content={content}
  onChange={setContent}
  placeholder="Enter text..."
/>
```

### Code Editor

Integrates CodeMirror for code editing:

```typescript
import { CodeEditor } from '@secretlobby/ui';

<CodeEditor
  value={code}
  onChange={setCode}
  language="typescript"
/>
```

## Utility Hooks

The package also exports useful React hooks:

```typescript
import { useDebounce, useLocalStorage, useMediaQuery } from '@secretlobby/ui';
```

## Styling

Components use Tailwind CSS 4 for styling. Customize the theme in your app's `tailwind.config.ts`:

```typescript
import { uiPreset } from '@secretlobby/ui/tailwind';

export default {
  presets: [uiPreset],
  // Your customizations
};
```
