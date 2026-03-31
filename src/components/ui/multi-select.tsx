"use client";

import { useState, useRef, useEffect } from "react";
import { X, Search } from "lucide-react";

interface MultiSelectOption {
  value: string;
  label: string;
  secondary?: string; // e.g. item type badge text
}

interface MultiSelectProps {
  id?: string;
  label?: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
}

export function MultiSelect({
  id,
  label,
  options,
  selected,
  onChange,
  placeholder = "Search...",
  emptyMessage = "No options available",
}: MultiSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options.filter(
    (opt) =>
      !selected.includes(opt.value) &&
      (opt.label.toLowerCase().includes(query.toLowerCase()) ||
        opt.secondary?.toLowerCase().includes(query.toLowerCase()))
  );

  const selectedOptions = selected
    .map((v) => options.find((o) => o.value === v))
    .filter(Boolean) as MultiSelectOption[];

  function handleSelect(value: string) {
    onChange([...selected, value]);
    setQuery("");
    inputRef.current?.focus();
  }

  function handleRemove(value: string) {
    onChange(selected.filter((v) => v !== value));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Backspace" && query === "" && selected.length > 0) {
      handleRemove(selected[selected.length - 1]);
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-1" ref={containerRef}>
      {label && (
        <label
          htmlFor={id}
          className="text-sm font-medium text-[var(--text-secondary)]"
        >
          {label}
        </label>
      )}

      {/* Selected chips + search input */}
      <div
        className={[
          "flex flex-wrap items-center gap-1 min-h-[36px] px-2 py-1",
          "bg-[var(--bg-primary)] border rounded-md cursor-text",
          "transition-colors duration-150",
          open
            ? "border-[var(--accent)] ring-2 ring-[var(--accent)]"
            : "border-[var(--border)]",
        ].join(" ")}
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {selectedOptions.map((opt) => (
          <span
            key={opt.value}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md bg-[var(--bg-elevated)] text-[var(--text-primary)]"
          >
            {opt.label}
            {opt.secondary && (
              <span className="text-[var(--text-secondary)]">
                ({opt.secondary})
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(opt.value);
              }}
              className="ml-0.5 rounded-full hover:bg-[var(--border)] p-0.5 transition-colors"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1 flex-1 min-w-[80px]">
          <Search size={12} className="text-[var(--text-secondary)] shrink-0" />
          <input
            ref={inputRef}
            id={id}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={selected.length === 0 ? placeholder : ""}
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none"
          />
        </div>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="relative">
          <div
            className={[
              "absolute z-50 w-full mt-1 max-h-[200px] overflow-y-auto",
              "bg-[var(--bg-surface)] border border-[var(--border)] rounded-md shadow-lg",
            ].join(" ")}
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                {query ? "No matches" : emptyMessage}
              </div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={[
                    "w-full text-left px-3 py-2 text-sm flex items-center justify-between",
                    "hover:bg-[var(--bg-elevated)] transition-colors duration-100",
                    "text-[var(--text-primary)]",
                  ].join(" ")}
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.secondary && (
                    <span className="text-xs text-[var(--text-secondary)] ml-2 shrink-0">
                      {opt.secondary}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
