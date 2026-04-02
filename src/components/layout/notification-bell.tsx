"use client";

import { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import type { Invite } from "@/types";

function InviteRow({
  invite,
  onAccept,
  accepting,
}: {
  invite: Invite;
  onAccept: (inviteId: string, projectId: string) => void;
  accepting: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-[var(--border)] last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--text-primary)] truncate">
          {invite.projectName ?? "Project invitation"}
        </p>
        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
          Invited to collaborate
        </p>
      </div>
      <Button
        variant="primary"
        size="sm"
        disabled={accepting}
        onClick={() => onAccept(invite.id, invite.projectId)}
        className="shrink-0 text-xs px-2 py-0.5"
      >
        {accepting ? "..." : "Join"}
      </Button>
    </div>
  );
}

export function NotificationBell() {
  const { pendingInvites, acceptInviteFn } = useAuth();
  const [open, setOpen] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const count = pendingInvites.length;

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleAccept(inviteId: string, projectId: string) {
    setError("");
    setAcceptingId(inviteId);
    try {
      await acceptInviteFn(inviteId, projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invite.");
    } finally {
      setAcceptingId(null);
    }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center justify-center w-7 h-7 rounded-md transition-colors relative"
        style={{ color: "var(--text-secondary)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
          e.currentTarget.style.color = "var(--text-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--text-secondary)";
        }}
        title="Notifications"
        aria-label={`Notifications${count > 0 ? ` (${count} pending)` : ""}`}
      >
        <Bell size={16} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[var(--danger)] text-white text-[10px] font-bold leading-none">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 w-72 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg z-50 overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Notifications
            </p>
          </div>

          {count === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-[var(--text-tertiary)]">
                No new notifications
              </p>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {pendingInvites.map((invite) => (
                <InviteRow
                  key={invite.id}
                  invite={invite}
                  onAccept={handleAccept}
                  accepting={acceptingId === invite.id}
                />
              ))}
            </div>
          )}

          {error && (
            <div className="px-3 py-2 border-t border-[var(--border)]">
              <p className="text-[11px] text-[var(--danger)]">{error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
