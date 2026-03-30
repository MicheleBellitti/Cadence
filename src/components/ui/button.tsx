"use client";
import { forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white",
  secondary:
    "bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-surface)]",
  ghost:
    "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]",
  danger:
    "bg-[var(--danger)] hover:opacity-90 text-white",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3.5 py-1.5 text-sm",
  lg: "px-5 py-2.5 text-base",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      className = "",
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={[
          "inline-flex items-center justify-center font-medium transition-all duration-150 rounded",
          variantClasses[variant],
          sizeClasses[size],
          disabled ? "opacity-50 pointer-events-none" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
export type { ButtonProps, ButtonVariant, ButtonSize };
