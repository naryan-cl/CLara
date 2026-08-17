"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";
import { htmlToMarkdown, markdownToHtml } from "@/lib/markdown/convert";

type MarkdownEditorProps = {
  initialMarkdown?: string;
  placeholder?: string;
  onChangeMarkdown?: (markdown: string) => void;
  /** When set, current markdown is written here on each change (for forms). */
  hiddenInputName?: string;
  minHeightClassName?: string;
};

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded px-2.5 py-2 text-xs font-medium transition-colors disabled:opacity-40 min-h-10 min-w-10 ${
        active
          ? "bg-forest text-paper"
          : "text-ink/70 hover:bg-cloud hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

export function MarkdownEditor({
  initialMarkdown = "",
  placeholder = "Write here…",
  onChangeMarkdown,
  hiddenInputName,
  minHeightClassName = "min-h-[220px]",
}: MarkdownEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-horizon underline" },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: markdownToHtml(initialMarkdown),
    editorProps: {
      attributes: {
        class: [
          minHeightClassName,
          "px-3 py-2 focus:outline-none text-sm leading-6 text-ink",
          "[&_h1]:mb-2 [&_h1]:font-display [&_h1]:text-2xl [&_h1]:font-medium",
          "[&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-medium",
          "[&_h3]:mb-1 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-medium",
          "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
          "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
          "[&_p]:my-2",
          "[&_a]:text-horizon [&_a]:underline",
          "[&_strong]:font-semibold",
          "[&_em]:italic",
          "[&_u]:underline",
        ].join(" "),
      },
    },
    onUpdate: ({ editor: current }) => {
      const md = htmlToMarkdown(current.getHTML());
      onChangeMarkdown?.(md);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const md = htmlToMarkdown(editor.getHTML());
    onChangeMarkdown?.(md);
    // Intentionally once when editor mounts with initial content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) {
    return (
      <div className="rounded-md border border-cloud bg-sand px-3 py-8 text-sm text-ink/50">
        Loading editor…
      </div>
    );
  }

  const markdown = htmlToMarkdown(editor.getHTML());

  return (
    <div className="overflow-hidden rounded-md border border-cloud bg-sand">
      <div className="flex flex-wrap gap-1 overflow-x-auto border-b border-cloud bg-paper px-2 py-1.5">
        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          label="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <span className="mx-1 w-px self-stretch bg-cloud" aria-hidden />
        <ToolbarButton
          label="Header"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        />
        <ToolbarButton
          label="Subhead"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        />
        <span className="mx-1 w-px self-stretch bg-cloud" aria-hidden />
        <ToolbarButton
          label="Bullets"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="Numbered"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          label="Indent"
          disabled={!editor.can().sinkListItem("listItem")}
          onClick={() => editor.chain().focus().sinkListItem("listItem").run()}
        />
        <ToolbarButton
          label="Outdent"
          disabled={!editor.can().liftListItem("listItem")}
          onClick={() => editor.chain().focus().liftListItem("listItem").run()}
        />
        <span className="mx-1 w-px self-stretch bg-cloud" aria-hidden />
        <ToolbarButton
          label="Link"
          active={editor.isActive("link")}
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
              return;
            }
            const previous = editor.getAttributes("link").href as
              | string
              | undefined;
            const url = window.prompt("Link URL", previous ?? "https://");
            if (!url) return;
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: url })
              .run();
          }}
        />
      </div>

      <div className="overflow-x-auto">
        <EditorContent editor={editor} />
      </div>

      {hiddenInputName ? (
        <input type="hidden" name={hiddenInputName} value={markdown} readOnly />
      ) : null}
    </div>
  );
}
