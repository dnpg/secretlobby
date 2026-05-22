// =============================================================================
// V1 → V2 page-layout migration
// -----------------------------------------------------------------------------
// Pre-v2 lobbies (no `lobby.settings.pageLayout`, or one with `version` < 2)
// rendered from fixed lobby fields: banner image, profile image, title +
// description sidebar, technical info, social links. v2 makes the page-builder
// layout the single source of truth for that content, so the first time the
// editor (or the live lobby render path) sees an un-migrated lobby we
// synthesise an equivalent `StoredPageLayout` from the DB columns + legacy
// settings keys.
//
// The migration runs lazily on read — it doesn't write back. The reducer
// loads the migrated layout into state, and the first user autosave persists
// it (now stamped with `version: 2`). That keeps the rollout reversible:
// reverting the branch leaves DB writes untouched.
// =============================================================================

import { getPublicUrl } from "@secretlobby/storage";
import { defaultSocialLinksSettings, type SocialLinksSettings } from "./social-platforms";
import {
  PAGE_LAYOUT_VERSION,
  type Block,
  type CardBlockContent,
  type Column,
  type HeadingBlockContent,
  type ImageBlockContent,
  type InlineDoc,
  type ParagraphBlockContent,
  type PlayerBlockContent,
  type Section,
  type SocialLinksBlockContent,
  type StoredPageLayout,
} from "~/components/page-builder/state/types";
import {
  createBlock,
  createSection,
  generateId,
} from "~/components/page-builder/state/helpers";

// Defaults applied to every text block the migration synthesises. Lifted
// to constants so the migration's heading sizing + paragraph font scale
// stay in one place — change here to retune the whole v1→v2 output.
const MIGRATION_HEADING_LEVEL: 1 | 2 | 3 | 4 | 5 | 6 = 4;
const MIGRATION_FONT_SIZE = "14px";

// Minimal Media shape — matches what `getLobbyByIdWithMedia` selects. Kept
// local so the migration doesn't need to import Prisma types.
interface MigrationMedia {
  id: string;
  key: string;
  type: string;
  embedUrl: string | null;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
}

export interface MigrationLobbyInput {
  title: string | null;
  description: string | null;
  bannerMedia: MigrationMedia | null;
  profileMedia: MigrationMedia | null;
}

export interface MigrationLegacySettings {
  technicalInfo?: { title?: string; content?: string } | null;
  socialLinks?: Partial<SocialLinksSettings> | null;
}

// True when the persisted layout JSON predates v2 — either no `pageLayout`
// at all (the only state in main), or one with `version` < PAGE_LAYOUT_VERSION.
export function needsV1Migration(rawLayout: unknown): boolean {
  if (!rawLayout || typeof rawLayout !== "object") return true;
  const obj = rawLayout as Record<string, unknown>;
  if (!Array.isArray(obj.sections)) return true;
  const v = typeof obj.version === "number" ? obj.version : 1;
  return v < PAGE_LAYOUT_VERSION;
}

export function migrateLobbyToV2(
  lobby: MigrationLobbyInput,
  legacySettings: MigrationLegacySettings,
  defaultPlaylistId: string
): StoredPageLayout {
  const sections: Section[] = [];

  // ---- Section 1: Banner ---------------------------------------------------
  // Full-width image block when the lobby row has a banner media ref. Dark
  // variant is intentionally dropped — the image block schema is single-image.
  if (lobby.bannerMedia) {
    const bannerSection = createSection(1);
    bannerSection.name = "Header";
    bannerSection.columns[0].name = "Container";
    bannerSection.columns[0].blocks = [imageBlockFromMedia(lobby.bannerMedia)];
    sections.push(bannerSection);
  }

  // ---- Section 2: 2-col content -------------------------------------------
  // Left col:  player on top → optional Technical Info card below.
  // Right col: optional profile image → optional Social Links card →
  //            optional About card (lobby.title + lobby.description).
  //
  // The right column is dropped (collapsing to a single full-width player +
  // tech-info column) only when every right-side input is absent. Otherwise
  // we keep the 2-col grid intact, matching the v1 sidebar layout.
  const playerBlock = createBlock("player");
  (playerBlock.content as PlayerBlockContent).playlistId = defaultPlaylistId;

  const leftBlocks: Block[] = [playerBlock];
  const techCard = buildTechnicalInfoCard(legacySettings.technicalInfo);
  if (techCard) leftBlocks.push(techCard);

  const rightBlocks: Block[] = [];
  if (lobby.profileMedia) {
    rightBlocks.push(imageBlockFromMedia(lobby.profileMedia));
  }
  const socialCard = buildSocialLinksCard(legacySettings.socialLinks);
  if (socialCard) rightBlocks.push(socialCard);
  const aboutCard = buildAboutCard(lobby.title, lobby.description);
  if (aboutCard) rightBlocks.push(aboutCard);

  if (rightBlocks.length > 0) {
    const content = createSection(2);
    content.name = "Content";

    const left: Column = content.columns[0];
    left.name = "Player";
    left.width = "66.66%";
    left.tabletWidth = "100%";
    left.blocks = leftBlocks;

    const right: Column = content.columns[1];
    right.name = "Sidebar";
    right.width = "33.33%";
    right.tabletWidth = "100%";
    right.blocks = rightBlocks;

    sections.push(content);
  } else {
    const content = createSection(1);
    content.name = "Content";
    content.columns[0].name = "Player";
    content.columns[0].blocks = leftBlocks;
    sections.push(content);
  }

  return { sections, version: PAGE_LAYOUT_VERSION };
}

// =============================================================================
// Helpers
// =============================================================================

function nonEmpty(s: string | null | undefined): boolean {
  return typeof s === "string" && s.trim().length > 0;
}

function imageBlockFromMedia(media: MigrationMedia): Block {
  const block = createBlock("image");
  const url =
    media.type === "EMBED"
      ? media.embedUrl || ""
      : media.key
        ? getPublicUrl(media.key)
        : "";
  (block.content as ImageBlockContent) = {
    mediaId: media.id,
    mediaUrl: url,
    alt: media.alt ?? undefined,
    mediaWidth: media.width ?? undefined,
    mediaHeight: media.height ?? undefined,
  };
  return block;
}

// Builds an "About" card with the lobby title as a Heading and the
// description as a Paragraph. Returns null when neither field has content so
// callers can skip rendering an empty card.
function buildAboutCard(
  title: string | null,
  description: string | null
): Block | null {
  const inner: Block[] = [];
  const trimmedTitle = nonEmpty(title) ? title!.trim() : "";
  if (trimmedTitle) inner.push(headingBlock(trimmedTitle));
  if (nonEmpty(description)) {
    inner.push(...htmlToBlocks(description!));
  }
  if (inner.length === 0) return null;
  const card = createBlock("card");
  (card.content as CardBlockContent) = {
    title: trimmedTitle || undefined,
    blocks: inner,
  };
  return card;
}

function buildTechnicalInfoCard(
  ti: { title?: string; content?: string } | null | undefined
): Block | null {
  if (!ti) return null;
  const title = typeof ti.title === "string" ? ti.title.trim() : "";
  const content = typeof ti.content === "string" ? ti.content : "";
  const hasContent = title.length > 0 || stripHtmlToPlainText(content).trim().length > 0;
  if (!hasContent) return null;

  const inner: Block[] = [];
  if (title) inner.push(headingBlock(title));
  if (content) inner.push(...htmlToBlocks(content));
  const card = createBlock("card");
  (card.content as CardBlockContent) = {
    title: title || undefined,
    blocks: inner,
  };
  return card;
}

function buildSocialLinksCard(
  raw: Partial<SocialLinksSettings> | null | undefined
): Block | null {
  if (!raw) return null;
  const merged: SocialLinksSettings = { ...defaultSocialLinksSettings, ...raw };
  const hasLinks = Array.isArray(merged.links) && merged.links.length > 0;
  const hasCopy =
    nonEmpty(merged.title) ||
    nonEmpty(merged.contentBefore) ||
    nonEmpty(merged.contentAfter);
  if (!hasLinks && !hasCopy) return null;

  const inner: Block[] = [];
  if (nonEmpty(merged.title)) inner.push(headingBlock(merged.title!.trim()));
  if (nonEmpty(merged.contentBefore)) {
    inner.push(...htmlToBlocks(merged.contentBefore!));
  }
  if (hasLinks) {
    const linksBlock = createBlock("socialLinks");
    (linksBlock.content as SocialLinksBlockContent) = {
      alignment: alignmentForSocialLinks(merged.iconAlignment),
      iconStyle: merged.iconStyle ?? "mono",
      iconColor: merged.iconColor,
      gap: merged.gap,
    };
    inner.push(linksBlock);
  }
  if (nonEmpty(merged.contentAfter)) {
    inner.push(...htmlToBlocks(merged.contentAfter!));
  }

  const card = createBlock("card");
  (card.content as CardBlockContent) = {
    title: nonEmpty(merged.title) ? merged.title!.trim() : undefined,
    blocks: inner,
  };
  return card;
}

// Standard heading block used for every card title the migration emits.
// Level is the `MIGRATION_HEADING_LEVEL` constant — kept here so callers
// don't reach into HeadingBlockContent and forget the level.
function headingBlock(text: string): Block {
  const h = createBlock("heading");
  (h.content as HeadingBlockContent) = {
    level: MIGRATION_HEADING_LEVEL,
    inline: textToInlineDoc(text),
  };
  return h;
}

function alignmentForSocialLinks(
  a: SocialLinksSettings["iconAlignment"]
): SocialLinksBlockContent["alignment"] {
  if (a === "left" || a === "right" || a === "center") return a;
  return "center";
}

// Best-effort HTML → plain text. Same shape as the in-route helper in
// page-builder.$lobbyId.tsx — kept local to keep this module dependency-free.
function stripHtmlToPlainText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function textToInlineDoc(text: string): InlineDoc {
  const trimmed = text.trim();
  if (!trimmed) return { type: "doc", content: [{ type: "paragraph" }] };
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: trimmed }],
      },
    ],
  };
}

// =============================================================================
// HTML → Block[] parser
// -----------------------------------------------------------------------------
// Walks the legacy WYSIWYG HTML (paragraphs, headings, marks, links) and
// emits a mix of Paragraph + Heading blocks for the page-builder layout.
//
// Rules:
//   - `<h1>..<h6>` becomes its own Heading block at the SAME level (level
//     comes from the tag, not MIGRATION_HEADING_LEVEL — that constant only
//     governs headings the migration synthesises from non-HTML fields like
//     `lobby.title` or `technicalInfo.title`).
//   - Adjacent `<p>` / `<div>` / `<li>` blocks collapse into a single
//     Paragraph block, separated by a double `hardBreak` so the visible
//     spacing survives as `<br/><br/>`. Runs of 3+ breaks are clamped to 2.
//   - Inline marks supported: `<strong>/<b>` → bold, `<em>/<i>` → italic,
//     `<u>` → underline, `<code>` → code mark, `<a>` → link mark with
//     `{href, target, rel}` attrs. These match the Tiptap StarterKit +
//     Underline + Link extensions configured in InlineEditor.tsx.
//   - Unknown tags are dropped (content survives).
//
// Returns `[]` when the body strips to nothing visible so callers can skip
// rendering an empty card.
// =============================================================================

type LinkAttrs = { href: string; target?: string; rel?: string };
type InlineMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "code" }
  | { type: "link"; attrs: LinkAttrs };

type InlineNode =
  | { type: "text"; text: string; marks?: InlineMark[] }
  | { type: "hardBreak" };

const SIMPLE_MARK_BY_TAG: Record<string, InlineMark["type"]> = {
  strong: "bold",
  b: "bold",
  em: "italic",
  i: "italic",
  u: "underline",
  code: "code",
};

const BLOCK_BOUNDARY_TAGS = new Set([
  "p",
  "div",
  "li",
  "ul",
  "ol",
  "blockquote",
]);

function htmlToBlocks(html: string): Block[] {
  if (!html) return [];

  const blocks: Block[] = [];
  let paraBuf: InlineNode[] = [];
  let headingBuf: InlineNode[] = [];
  let headingLevel: 1 | 2 | 3 | 4 | 5 | 6 = 1;
  let target: "para" | "heading" = "para";
  const markStack: InlineMark[] = [];

  const activeBuf = (): InlineNode[] =>
    target === "heading" ? headingBuf : paraBuf;

  const trimBreaks = (b: InlineNode[]): InlineNode[] => {
    let start = 0;
    let end = b.length;
    while (start < end && b[start].type === "hardBreak") start++;
    while (end > start && b[end - 1].type === "hardBreak") end--;
    return b.slice(start, end);
  };

  const flushPara = () => {
    const trimmed = trimBreaks(paraBuf);
    paraBuf = [];
    if (trimmed.length === 0) return;
    const p = createBlock("paragraph");
    (p.content as ParagraphBlockContent) = {
      inline: {
        type: "doc",
        content: [{ type: "paragraph", content: trimmed }],
      },
      fontSize: MIGRATION_FONT_SIZE,
    };
    blocks.push(p);
  };

  const flushHeading = () => {
    const trimmed = trimBreaks(headingBuf);
    headingBuf = [];
    if (trimmed.length === 0) return;
    const h = createBlock("heading");
    (h.content as HeadingBlockContent) = {
      level: headingLevel,
      inline: {
        type: "doc",
        content: [{ type: "paragraph", content: trimmed }],
      },
    };
    blocks.push(h);
  };

  // Push a hardBreak, but cap the trailing run at 2 so `<p></p>` between two
  // populated blocks doesn't bloat the gap beyond a double-break.
  const pushBreak = (b: InlineNode[]) => {
    let trailing = 0;
    for (let i = b.length - 1; i >= 0; i--) {
      if (b[i].type === "hardBreak") trailing++;
      else break;
    }
    if (trailing >= 2) return;
    b.push({ type: "hardBreak" });
  };
  const pushDoubleBreak = (b: InlineNode[]) => {
    // Only emit gap-breaks when there's already real content to separate;
    // leading double-breaks would create blank space at the top of the card.
    if (!b.some((n) => n.type !== "hardBreak")) return;
    pushBreak(b);
    pushBreak(b);
  };

  const pushText = (raw: string) => {
    const cleaned = decodeEntities(raw).replace(/\s+/g, " ");
    if (!cleaned) return;
    const b = activeBuf();
    // Skip pure whitespace at buffer start / right after a break — keeps the
    // doc from collecting stray spaces around tag boundaries.
    const trimmed =
      b.length === 0 || b[b.length - 1].type === "hardBreak"
        ? cleaned.replace(/^\s+/, "")
        : cleaned;
    if (!trimmed) return;
    const marks =
      markStack.length > 0 ? markStack.map((m) => ({ ...m })) : undefined;
    b.push({ type: "text", text: trimmed, marks });
  };

  const popMark = (type: InlineMark["type"]) => {
    for (let i = markStack.length - 1; i >= 0; i--) {
      if (markStack[i].type === type) {
        markStack.splice(i, 1);
        return;
      }
    }
  };

  // Tokenizer — alternation of `tag` or `text run`. Captures: 1=slash or
  // empty, 2=tag name, 3=raw attributes, 4=text run.
  const TOK_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)\/?>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = TOK_RE.exec(html)) !== null) {
    if (m[4] !== undefined) {
      pushText(m[4]);
      continue;
    }
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    const attrs = parseAttrs(m[3] ?? "");

    if (name === "br") {
      if (!closing) activeBuf().push({ type: "hardBreak" });
      continue;
    }

    if (/^h[1-6]$/.test(name)) {
      if (!closing) {
        flushPara();
        headingLevel = parseInt(name[1], 10) as 1 | 2 | 3 | 4 | 5 | 6;
        target = "heading";
      } else {
        flushHeading();
        target = "para";
      }
      continue;
    }

    if (BLOCK_BOUNDARY_TAGS.has(name)) {
      if (closing) pushDoubleBreak(activeBuf());
      continue;
    }

    const simpleMark = SIMPLE_MARK_BY_TAG[name];
    if (simpleMark) {
      if (closing) popMark(simpleMark);
      else markStack.push({ type: simpleMark } as InlineMark);
      continue;
    }

    if (name === "a") {
      if (closing) {
        popMark("link");
      } else if (attrs.href) {
        const linkAttrs: LinkAttrs = { href: attrs.href };
        if (attrs.target) linkAttrs.target = attrs.target;
        if (attrs.rel) linkAttrs.rel = attrs.rel;
        markStack.push({ type: "link", attrs: linkAttrs });
      }
      continue;
    }

    // Unknown tag — silently drop, content runs continue to flow into the
    // active buffer.
  }

  // Final flush. Heading first in case the doc ends mid-heading (unclosed
  // tags); flushPara will pick up any leftover inline content.
  if (target === "heading") flushHeading();
  flushPara();

  return blocks;
}

// Lightweight HTML attribute parser. Doesn't honour every edge case of the
// spec — just enough for href/target/rel/etc. as the legacy editor emitted
// them. Quoted (single or double) + bare values; case-insensitive names.
function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  const ATTR_RE =
    /([a-zA-Z_][a-zA-Z0-9_-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(raw)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    out[name] = decodeEntities(value);
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    );
}

// Re-export so the loader can stamp version on layouts it builds from
// scratch when it would rather skip the full migration path.
export { generateId };
