# Project Instructions

  ## On Session Start
  Always check MCP memory first to recall project context:
  - Run `mcp__memory__session_summary` to get active tasks and recent memories
  - Run `mcp__memory__context_get` to retrieve project architecture and tech stack

  ## Project: Band-Blast (SecretLobby.io)
  See MCP memory for full details about architecture, tech stack, and features.

  ## Marketing Site Hero Canvas

  ### LogoDistortionBackground Component
  - Uses WebGL with instanced rendering for 1000 logos
  - Logos have water/pond ripple effect on mouse hover
  - Touch support via touchend for mobile ripple effect while allowing scrolling
  - Canvas uses DPR capped at 2 for buffer sizing

  ### Known Issue: Mobile Logo Sizing (Deferred)
  **Status:** Deferred for future investigation

  On real iPhone devices (Safari and Chrome), logos appear extremely tiny compared to
  desktop browser simulation.

  **Investigation summary:**
  - Desktop Chrome mobile simulation shows correct sizes
  - Real iPhone (both Safari and Chrome) shows tiny logos
  - Debug showed canvas dimensions are correct (428x715, DPR=3)
  - Issue is related to high-DPR devices (DPR=3) but root cause not fully identified

  **Attempted fixes (all reverted to maintain desktop functionality):**
  - DPR compensation
  - sizeScale uniform adjustments
  - JavaScript-based scaling (worked on Safari iPhone but not Chrome iPhone)

  Changes were reverted to maintain desktop functionality. Issue deferred for future fix.   