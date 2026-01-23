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
import { useState, useCallback } from "react";
import { cn } from "../lib/utils.js";
import "./RichTextEditor.css";

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
  | "table";

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
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Image URL");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const insertTable = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

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
      </div>

      {/* Editor Content */}
      <EditorContent editor={editor} />

      {/* Hidden input for form submission */}
      {name && <input type="hidden" name={name} value={hiddenValue} />}
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
        "p-1.5 rounded transition-colors",
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
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
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
