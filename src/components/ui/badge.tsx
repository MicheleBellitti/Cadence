type BadgeVariant = "default" | "success" | "warning" | "danger" | "purple" | "blue";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:
    "bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
  success:
    "bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)]",
  warning:
    "bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-[var(--warning)]",
  danger:
    "bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)]",
  purple:
    "bg-[color-mix(in_srgb,var(--purple)_15%,transparent)] text-[var(--purple)]",
  blue:
    "bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]",
};

function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

export { Badge };
export type { BadgeProps, BadgeVariant };
