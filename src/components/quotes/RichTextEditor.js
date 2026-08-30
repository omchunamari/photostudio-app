"use client";

import { useEffect, useRef } from "react";
import { Bold, Italic, Underline, List, ListOrdered, Link2, Unlink } from "lucide-react";

// Minimal contentEditable rich text field. Stores/returns plain HTML.
// Deliberately small (no external editor dependency) — matches the
// reference app's bare B/I/U + lists + link toolbar exactly.
export default function RichTextEditor({ value, onChange, placeholder, minHeight = 90 }) {
  const ref = useRef(null);

  // Keep the DOM in sync when `value` changes from outside (e.g. loading a
  // template) without fighting the caret while the user is typing.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || "")) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  function exec(command, arg) {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    onChange?.(ref.current?.innerHTML || "");
  }

  function handleLink() {
    const url = window.prompt("Link URL");
    if (url) exec("createLink", url);
  }

  const buttons = [
    { icon: Bold, command: "bold", title: "Bold" },
    { icon: Italic, command: "italic", title: "Italic" },
    { icon: Underline, command: "underline", title: "Underline" },
    { icon: List, command: "insertUnorderedList", title: "Bullet list" },
    { icon: ListOrdered, command: "insertOrderedList", title: "Numbered list" },
  ];

  return (
    <div className="rounded-md border border-input bg-background">
      <div className="flex items-center gap-0.5 border-b border-border px-2 py-1.5">
        {buttons.map(({ icon: Icon, command, title }) => (
          <button
            key={command}
            type="button"
            title={title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(command)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
        <button
          type="button"
          title="Add link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleLink}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Remove link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("unlink")}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Unlink className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={(e) => onChange?.(e.currentTarget.innerHTML)}
        onBlur={(e) => onChange?.(e.currentTarget.innerHTML)}
        style={{ minHeight }}
        className="quote-rte prose prose-sm max-w-none px-3 py-2.5 text-sm text-foreground focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-blue-600 [&_a]:underline"
      />
      <style jsx global>{`
        .quote-rte:empty:before {
          content: attr(data-placeholder);
          color: var(--muted-foreground);
        }
      `}</style>
    </div>
  );
}