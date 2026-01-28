import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Placeholder from "@tiptap/extension-placeholder";
import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "../lib/utils.js";
import "./RichTextEditor.css";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { html } from "@codemirror/lang-html";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";

export type RichTextEditorFeature =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "heading"
  | "bulletList"
  | "orderedList"
  | "blockquote"
  | "codeBlock"
  | "horizontalRule"
  | "link"
  | "image"
  | "textAlign"
  | "table"
  | "htmlSource";

const ALL_FEATURES: RichTextEditorFeature[] = [
  "bold",
  "italic",
  "underline",
  "strike",
  "heading",
  "bulletList",
  "orderedList",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "link",
  "image",
  "textAlign",
  "table",
  "htmlSource",
];

interface RichTextEditorProps {
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  features?: RichTextEditorFeature[];
  className?: string;
  onChange?: (html: string) => void;
}

export function RichTextEditor({
  name,
  defaultValue = "",
  placeholder,
  features = ALL_FEATURES,
  className,
  onChange,
}: RichTextEditorProps) {
  const [hiddenValue, setHiddenValue] = useState(defaultValue);
  const [showSource, setShowSource] = useState(false);
  const [sourceHtml, setSourceHtml] = useState(defaultValue);
  const [urlDialog, setUrlDialog] = useState<{
    type: "link" | "image";
    defaultValue: string;
    defaultTarget: string;
    selectionFrom: number;
    selectionTo: number;
  } | null>(null);

  const featureSet = new Set(features);

  const extensions = buildExtensions(featureSet, placeholder);

  const editor = useEditor({
    extensions,
    content: defaultValue,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setHiddenValue(html);
      onChange?.(html);
    },
  });

  const setLink = useCallback(() => {
    if (!editor) return;
    const attrs = editor.getAttributes("link");
    const { from, to } = editor.state.selection;
    setUrlDialog({
      type: "link",
      defaultValue: attrs.href ?? "",
      defaultTarget: attrs.target ?? "_self",
      selectionFrom: from,
      selectionTo: to,
    });
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    setUrlDialog({
      type: "image",
      defaultValue: "",
      defaultTarget: "_self",
      selectionFrom: from,
      selectionTo: to,
    });
  }, [editor]);

  const handleUrlSubmit = useCallback((url: string, target: string) => {
    if (!editor || !urlDialog) return;
    const sel = { from: urlDialog.selectionFrom, to: urlDialog.selectionTo };
    if (urlDialog.type === "link") {
      if (url === "") {
        // Remove link — extend to full mark range first
        editor.chain().focus().setTextSelection(sel).extendMarkRange("link").unsetLink().run();
      } else {
        // Apply link to the saved selection in a single chain
        editor.chain().focus().setTextSelection(sel).setLink({ href: url, target }).run();
      }
    } else if (urlDialog.type === "image" && url) {
      editor.chain().focus().setTextSelection(sel).setImage({ src: url }).run();
    }
    setUrlDialog(null);
  }, [editor, urlDialog]);

  const insertTable = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  const toggleSource = useCallback(() => {
    if (!editor) return;
    if (showSource) {
      // Switching from source → WYSIWYG: apply edited HTML
      editor.commands.setContent(sourceHtml, false);
      setHiddenValue(sourceHtml);
      onChange?.(sourceHtml);
    } else {
      // Switching from WYSIWYG → source: grab current HTML
      setSourceHtml(editor.getHTML());
    }
    setShowSource(!showSource);
  }, [editor, showSource, sourceHtml, onChange]);

  const handleSourceInput = useCallback((value: string) => {
    setSourceHtml(value);
    setHiddenValue(value);
    onChange?.(value);
  }, [onChange]);

  if (!editor) return null;

  return (
    <div className={cn("rich-text-editor rounded-lg border border-theme overflow-hidden bg-theme-tertiary", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-0.5 p-1.5 border-b border-theme bg-theme-secondary/50">
        {featureSet.has("bold") && (
          <ToolbarButton
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/>
            </svg>
          </ToolbarButton>
        )}

        {featureSet.has("italic") && (
          <ToolbarButton
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/>
            </svg>
          </ToolbarButton>
        )}

        {featureSet.has("underline") && (
          <ToolbarButton
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/>
            </svg>
          </ToolbarButton>
        )}

        {featureSet.has("strike") && (
          <ToolbarButton
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Strikethrough"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z"/>
            </svg>
          </ToolbarButton>
        )}

        {featureSet.has("heading") && (
          <>
            <Separator />
            <ToolbarButton
              active={editor.isActive("heading", { level: 1 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              title="Heading 1"
            >
              <span className="text-xs font-bold">H1</span>
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive("heading", { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              title="Heading 2"
            >
              <span className="text-xs font-bold">H2</span>
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive("heading", { level: 3 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              title="Heading 3"
            >
              <span className="text-xs font-bold">H3</span>
            </ToolbarButton>
          </>
        )}

        {(featureSet.has("bulletList") || featureSet.has("orderedList")) && <Separator />}

        {featureSet.has("bulletList") && (
          <ToolbarButton
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet List"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/>
            </svg>
          </ToolbarButton>
        )}

        {featureSet.has("orderedList") && (
          <ToolbarButton
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Ordered List"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/>
            </svg>
          </ToolbarButton>
        )}

        {featureSet.has("blockquote") && (
          <ToolbarButton
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Blockquote"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/>
            </svg>
          </ToolbarButton>
        )}

        {featureSet.has("codeBlock") && (
          <ToolbarButton
            active={editor.isActive("codeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            title="Code Block"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
            </svg>
          </ToolbarButton>
        )}

        {featureSet.has("horizontalRule") && (
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Horizontal Rule"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 11h16v2H4z"/>
            </svg>
          </ToolbarButton>
        )}

        {featureSet.has("link") && (
          <>
            <Separator />
            <ToolbarButton
              active={editor.isActive("link")}
              onClick={setLink}
              title="Link"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
              </svg>
            </ToolbarButton>
          </>
        )}

        {featureSet.has("image") && (
          <ToolbarButton
            onClick={addImage}
            title="Image"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
          </ToolbarButton>
        )}

        {featureSet.has("textAlign") && (
          <>
            <Separator />
            <ToolbarButton
              active={editor.isActive({ textAlign: "left" })}
              onClick={() => editor.chain().focus().setTextAlign("left").run()}
              title="Align Left"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/>
              </svg>
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive({ textAlign: "center" })}
              onClick={() => editor.chain().focus().setTextAlign("center").run()}
              title="Align Center"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/>
              </svg>
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive({ textAlign: "right" })}
              onClick={() => editor.chain().focus().setTextAlign("right").run()}
              title="Align Right"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/>
              </svg>
            </ToolbarButton>
          </>
        )}

        {featureSet.has("table") && (
          <>
            <Separator />
            <ToolbarButton
              onClick={insertTable}
              title="Insert Table"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4v-4h4v4zm0-6H4v-4h4v4zm0-6H4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4z"/>
              </svg>
            </ToolbarButton>
          </>
        )}

        {featureSet.has("htmlSource") && (
          <>
            <Separator />
            <ToolbarButton
              active={showSource}
              onClick={toggleSource}
              title="HTML Source"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14.6 16.6l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4zm-5.2 0L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zM14.5 4l-5 16h-1l5-16h1z"/>
              </svg>
            </ToolbarButton>
          </>
        )}
      </div>

      {/* Editor Content / HTML Source */}
      {showSource ? (
        <HtmlSourceEditor value={sourceHtml} onChange={handleSourceInput} />
      ) : (
        <EditorContent editor={editor} />
      )}

      {/* Hidden input for form submission */}
      {name && <input type="hidden" name={name} value={hiddenValue} />}

      {/* URL Dialog */}
      {urlDialog && (
        <UrlDialog
          title={urlDialog.type === "link" ? "Insert Link" : "Insert Image"}
          defaultValue={urlDialog.defaultValue}
          defaultTarget={urlDialog.defaultTarget}
          showTarget={urlDialog.type === "link"}
          onSubmit={handleUrlSubmit}
          onClose={() => setUrlDialog(null)}
        />
      )}
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "p-1.5 rounded transition-colors cursor-pointer",
        active
          ? "bg-[var(--color-accent)]/20 text-[var(--color-accent,#6366f1)]"
          : "hover:bg-white/10 text-current"
      )}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <div className="w-px h-6 self-center mx-1 bg-theme-border opacity-30" />;
}

function UrlDialog({
  title,
  defaultValue,
  defaultTarget,
  showTarget,
  onSubmit,
  onClose,
}: {
  title: string;
  defaultValue: string;
  defaultTarget: string;
  showTarget: boolean;
  onSubmit: (url: string, target: string) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(defaultValue);
  const [target, setTarget] = useState(defaultTarget || "_self");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleInsert = () => {
    onSubmit(url, target);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleInsert();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const inputClasses = "w-full px-3 py-2 rounded-md border border-theme bg-theme-tertiary text-current text-sm outline-none focus:ring-1 focus:ring-[var(--color-accent,#6366f1)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50" />
      <div
        className="relative bg-theme-secondary border border-theme rounded-lg shadow-xl p-4 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h3 className="text-sm font-medium mb-3">{title}</h3>
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-xs mb-1 opacity-70">URL</label>
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              className={inputClasses}
            />
          </div>
          {showTarget && (
            <div>
              <label className="block text-xs mb-1 opacity-70">Open in</label>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className={cn(inputClasses, "cursor-pointer")}
              >
                <option value="_self">Same tab</option>
                <option value="_blank">New tab</option>
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-md hover:bg-white/10 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleInsert}
              className="px-3 py-1.5 text-sm rounded-md btn-primary cursor-pointer"
            >
              {defaultValue ? "Update" : "Insert"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HtmlSourceEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        html(),
        oneDark,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          "&": { minHeight: "200px", fontSize: "13px" },
          ".cm-scroller": { overflow: "auto" },
          ".cm-content": { padding: "8px 0" },
        }),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  // Only create the editor once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="overflow-hidden" />;
}

function buildExtensions(featureSet: Set<RichTextEditorFeature>, placeholder?: string) {
  const extensions: any[] = [
    StarterKit.configure({
      heading: featureSet.has("heading") ? { levels: [1, 2, 3] } : false,
      bulletList: featureSet.has("bulletList") ? {} : false,
      orderedList: featureSet.has("orderedList") ? {} : false,
      blockquote: featureSet.has("blockquote") ? {} : false,
      codeBlock: featureSet.has("codeBlock") ? {} : false,
      horizontalRule: featureSet.has("horizontalRule") ? {} : false,
      bold: featureSet.has("bold") ? {} : false,
      italic: featureSet.has("italic") ? {} : false,
      strike: featureSet.has("strike") ? {} : false,
    }),
  ];

  if (featureSet.has("underline")) {
    extensions.push(Underline);
  }

  if (featureSet.has("link")) {
    extensions.push(
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
      })
    );
  }

  if (featureSet.has("image")) {
    extensions.push(Image);
  }

  if (featureSet.has("textAlign")) {
    extensions.push(
      TextAlign.configure({
        types: ["heading", "paragraph"],
      })
    );
  }

  if (featureSet.has("table")) {
    extensions.push(Table.configure({ resizable: false }));
    extensions.push(TableRow);
    extensions.push(TableCell);
    extensions.push(TableHeader);
  }

  if (placeholder) {
    extensions.push(Placeholder.configure({ placeholder }));
  }

  return extensions;
}
