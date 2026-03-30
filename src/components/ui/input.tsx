"use client";
import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={id}
            className="text-sm font-medium text-[var(--text-secondary)]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={[
            "w-full px-3 py-1.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-md",
            "text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]",
            "focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent",
            "transition-colors duration-150",
            error ? "border-[var(--danger)]" : "",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...props}
        />
        {error && (
          <span className="text-xs text-[var(--danger)]">{error}</span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
export type { InputProps };
