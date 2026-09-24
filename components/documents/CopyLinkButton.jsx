"use client";

import { useState } from "react";
import { Link2, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * Copy a document's Google Docs link to the clipboard.
 * Toast = async action outcome (allowed by the toast policy); it confirms
 * an action that gave no other feedback.
 */
export function CopyLinkButton({ url }) {
  const [copied, setCopied] = useState(false);
  if (!url) return null;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link dokumen disalin");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin link");
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      className="relative inline-flex size-9 items-center justify-center rounded-md text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1 after:absolute after:-inset-1 after:content-['']"
      aria-label="Salin link dokumen"
    >
      {copied ? (
        <Check className="size-4 text-primary" aria-hidden="true" />
      ) : (
        <Link2 className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}
