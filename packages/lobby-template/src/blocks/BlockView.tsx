// =============================================================================
// BlockView — dispatcher for the lobby's per-block renderers
// -----------------------------------------------------------------------------
// Maps a persisted block to the right view component. Lives in the package
// so the lobby can drop a single `<BlockView />` into its render path and
// pick up every block type the package supports.
//
// What's covered today:
//   - heading / paragraph / quote — text views with InlineContent
//   - bulletList / orderedList — InlineDoc-per-item lists
//   - code (inline) / codeBlock (multi-line)
//   - image — responsive <picture> with theme-driven borders
//   - divider — themed <hr>
//   - socialLinks — uses the caller-provided social settings
//   - table — InlineDoc-per-cell with optional header row
//
// What's NOT yet covered (returns the fallback): player, card, gallery.
// Those need either runtime context (player → audio state) or recursion
// into nested blocks (card → its own block list). The caller passes
// `renderFallback` so the lobby can plug in its existing PlayerView for the
// `player` case while we build the proper PlayerBlockView.
// =============================================================================

import type { Block, ThemeSettings } from "./types";
import type { SocialLinksSettings } from "../SocialLinks";
import { DividerView } from "./DividerView";
import { HeadingView } from "./HeadingView";
import { ParagraphView } from "./ParagraphView";
import { QuoteView } from "./QuoteView";
import { BulletListView } from "./BulletListView";
import { OrderedListView } from "./OrderedListView";
import { CodeView } from "./CodeView";
import { CodeBlockView } from "./CodeBlockView";
import { ImageBlockView } from "./ImageBlockView";
import { SocialLinksBlockView } from "./SocialLinksBlockView";
import { TableView } from "./TableView";
import type {
  BulletListBlockContent,
  CardBlockContent,
  CodeBlockBlockContent,
  CodeBlockContent,
  DividerBlockContent,
  GalleryBlockContent,
  HeadingBlockContent,
  ImageBlockContent,
  OrderedListBlockContent,
  ParagraphBlockContent,
  PlayerBlockContent,
  QuoteBlockContent,
  SocialLinksBlockContent,
  TableBlockContent,
} from "./types";

export interface BlockViewProps {
  block: Block;
  /** Global theme — passed to any view that reads per-block theme fallbacks
   *  (image borders, button vars, etc.). The lobby gets this from its loader
   *  via `getLobbyThemeSettings`. */
  theme: ThemeSettings;
  /** Lobby-level social-link settings. Only consulted when the block is a
   *  socialLinks block; pass an empty value otherwise. */
  socialLinks: SocialLinksSettings;
  /** Render override for block types we haven't extracted into a view yet —
   *  `player`, `card`, `gallery`. The lobby plugs in its existing PlayerView
   *  (with audio state) for `player`, falls back to `null` otherwise. Called
   *  with the block so the callback can downcast `block.content` to the
   *  block type's content shape. */
  renderFallback?: (block: Block) => React.ReactNode;
}

export function BlockView({
  block,
  theme,
  socialLinks,
  renderFallback,
}: BlockViewProps) {
  // Hidden blocks drop out of the render entirely on the lobby. The editor
  // surfaces them dimmed; the lobby never shows them.
  if (block.hidden === true) return null;

  // Per-block theme override: merge `block.themeOverrides` on top of the
  // global theme before handing it down. Same precedence the editor uses
  // (block fields win over theme fields).
  const effectiveTheme: ThemeSettings = block.themeOverrides
    ? { ...theme, ...block.themeOverrides }
    : theme;

  // marginBottom is a universal block-level spacing override. Wrap every
  // block in a div that carries it so the column's gap (set on the parent
  // flex container) and the block's own margin stack predictably.
  const wrapperStyle = block.marginBottom
    ? { marginBottom: block.marginBottom }
    : undefined;

  let inner: React.ReactNode;
  switch (block.type) {
    case "heading":
      inner = <HeadingView content={block.content as HeadingBlockContent} />;
      break;
    case "paragraph":
      inner = <ParagraphView content={block.content as ParagraphBlockContent} />;
      break;
    case "quote":
      inner = <QuoteView content={block.content as QuoteBlockContent} />;
      break;
    case "bulletList":
      inner = (
        <BulletListView content={block.content as BulletListBlockContent} />
      );
      break;
    case "orderedList":
      inner = (
        <OrderedListView content={block.content as OrderedListBlockContent} />
      );
      break;
    case "code":
      inner = <CodeView content={block.content as CodeBlockContent} />;
      break;
    case "codeBlock":
      inner = (
        <CodeBlockView content={block.content as CodeBlockBlockContent} />
      );
      break;
    case "image":
      inner = (
        <ImageBlockView
          content={block.content as ImageBlockContent}
          theme={effectiveTheme}
        />
      );
      break;
    case "divider":
      // Acknowledge the typed content shape even though DividerView reads
      // nothing from it — keeps the switch arms shaped identically and
      // signals intent if we ever add divider-specific fields.
      void (block.content as DividerBlockContent);
      inner = <DividerView />;
      break;
    case "socialLinks":
      inner = (
        <SocialLinksBlockView
          content={block.content as SocialLinksBlockContent}
          socialLinks={socialLinks}
        />
      );
      break;
    case "table":
      inner = <TableView content={block.content as TableBlockContent} />;
      break;
    case "player":
    case "card":
    case "gallery":
      // Acknowledge the content type for each fallback case so a future
      // extraction has the type narrowing already wired up — the cast is
      // discarded at runtime.
      void (block.content as
        | PlayerBlockContent
        | CardBlockContent
        | GalleryBlockContent);
      inner = renderFallback ? renderFallback(block) : null;
      break;
    default:
      // Unknown block type — render nothing. Persisted content may carry a
      // type we don't recognise (forward-compat with editor-only additions);
      // we'd rather render the surrounding section than crash.
      inner = null;
  }

  if (!wrapperStyle) return <>{inner}</>;
  return <div style={wrapperStyle}>{inner}</div>;
}
