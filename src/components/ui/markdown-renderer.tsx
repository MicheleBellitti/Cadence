"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type ComponentPropsWithoutRef } from "react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function MarkdownLink(props: ComponentPropsWithoutRef<"a">) {
  return (
    <a {...props} target="_blank" rel="noopener noreferrer">
      {props.children}
    </a>
  );
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  if (!content.trim()) {
    return null;
  }

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
