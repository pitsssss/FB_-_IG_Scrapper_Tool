"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export function CodeBlock({
  code,
  className,
  label = "Copy",
}: {
  code: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={cn("relative rounded-lg border border-[var(--border)] bg-[var(--code-bg)]", className)}>
      <div className="absolute right-2 top-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onCopy}
          aria-label={copied ? "Copied" : label}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 pr-24 text-xs leading-relaxed text-[var(--foreground)] font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}
