"use client";

import { Component, useState, useId, type KeyboardEvent, type ReactNode } from "react";
import { MarkdownRenderer } from "./markdown-renderer";

// Error boundary for preview panel
class PreviewErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return <p className="px-3 py-2 text-sm text-[var(--text-secondary)]">Unable to render preview.</p>;
    }
    return this.props.children;
  }
}

interface MarkdownTextareaProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}

type Tab = "edit" | "preview";

export function MarkdownTextarea({
  value,
  onChange,
  id,
  label,
  placeholder,
  rows = 3,
  maxLength,
}: MarkdownTextareaProps) {
  const [activeTab, setActiveTab] = useState<Tab>("edit");
  const generatedId = useId();
  const tabPanelId = `${id ?? generatedId}-tabpanel`;
  const editTabId = `${id ?? generatedId}-tab-edit`;
  const previewTabId = `${id ?? generatedId}-tab-preview`;

  function handleTabKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setActiveTab((prev) => (prev === "edit" ? "preview" : "edit"));
    }
  }

  const tabClass = (active: boolean) =>
    `px-3.5 py-1.5 text-[13px] font-medium bg-transparent border-none cursor-pointer transition-colors duration-150 border-b-2 ${
      active
        ? "border-b-[var(--accent)] text-[var(--accent)]"
        : "border-b-transparent text-[var(--text-secondary)]"
    }`;

  return (
    <div>
      {label && (
        <label
          htmlFor={activeTab === "edit" ? id : undefined}
          className="block mb-1.5 text-sm font-medium text-[var(--text-secondary)]"
        >
          {label}
        </label>
      )}
      <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg-primary)]">
        {/* Tab bar */}
        <div
          role="tablist"
          aria-label={label ? `${label} editor` : "Markdown editor"}
          className="flex border-b border-[var(--border)] bg-[var(--bg-surface)]"
        >
          <button
            role="tab"
            id={editTabId}
            aria-selected={activeTab === "edit"}
            aria-controls={tabPanelId}
            tabIndex={activeTab === "edit" ? 0 : -1}
            onKeyDown={handleTabKeyDown}
            onClick={() => setActiveTab("edit")}
            className={tabClass(activeTab === "edit")}
          >
            Edit
          </button>
          <button
            role="tab"
            id={previewTabId}
            aria-selected={activeTab === "preview"}
            aria-controls={tabPanelId}
            tabIndex={activeTab === "preview" ? 0 : -1}
            onKeyDown={handleTabKeyDown}
            onClick={() => setActiveTab("preview")}
            className={tabClass(activeTab === "preview")}
          >
            Preview
          </button>
        </div>

        {/* Tab panel */}
        <div
          role="tabpanel"
          id={tabPanelId}
          aria-labelledby={activeTab === "edit" ? editTabId : previewTabId}
        >
          {activeTab === "edit" ? (
            <textarea
              id={id}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              rows={rows}
              maxLength={maxLength}
              className="w-full resize-y bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-inset"
              style={{ minHeight: `${rows * 1.5 + 1}rem` }}
            />
          ) : (
            <PreviewErrorBoundary>
              <div className="px-3 py-2" style={{ minHeight: `${rows * 1.5 + 1}rem` }}>
                {value.trim() ? (
                  <MarkdownRenderer content={value} />
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">
                    Nothing to preview
                  </p>
                )}
              </div>
            </PreviewErrorBoundary>
          )}
        </div>
      </div>
    </div>
  );
}
