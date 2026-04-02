"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "./auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Invite } from "@/types";

function InviteCard({
  invite,
  onAccept,
  accepting,
}: {
  invite: Invite;
  onAccept: (inviteId: string, projectId: string) => Promise<void>;
  accepting: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
          {invite.projectName ?? "Project invitation"}
        </p>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          You&apos;ve been invited to collaborate
        </p>
      </div>
      <Button
        variant="primary"
        size="sm"
        disabled={accepting}
        onClick={() => onAccept(invite.id, invite.projectId)}
        className="shrink-0"
      >
        {accepting ? (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Accepting…
          </span>
        ) : (
          "Accept"
        )}
      </Button>
    </div>
  );
}

export function NoProjectScreen() {
  const { pendingInvites, acceptInviteFn, createProject } = useAuth();

  // Create project form state
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Accept invite state
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState("");

  async function handleCreateProject(e: FormEvent) {
    e.preventDefault();
    const name = projectName.trim();
    if (!name) return;
    if (name.length > 100) {
      setCreateError("Project name must be 100 characters or less.");
      return;
    }
    setCreateError("");
    setCreating(true);
    try {
      await createProject(name);
      // AuthGate will re-render once user.projectId is set
    } catch (err: unknown) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create project. Please try again."
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleAcceptInvite(inviteId: string, projectId: string) {
    setAcceptError("");
    setAcceptingId(inviteId);
    try {
      await acceptInviteFn(inviteId, projectId);
      // AuthGate will re-render once user.projectId is set
    } catch (err: unknown) {
      setAcceptError(
        err instanceof Error ? err.message : "Failed to accept invite. Please try again."
      );
    } finally {
      setAcceptingId(null);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--accent)] text-white text-xl font-bold mb-4">
            C
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Cadence</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            You&apos;re not part of a project yet
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {/* Pending Invites */}
          {pendingInvites.length > 0 && (
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 shadow-sm">
              <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1">
                Pending invitations
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                You have been invited to join the following project{pendingInvites.length > 1 ? "s" : ""}.
              </p>
              <div className="flex flex-col gap-3">
                {pendingInvites.map((invite) => (
                  <InviteCard
                    key={invite.id}
                    invite={invite}
                    onAccept={handleAcceptInvite}
                    accepting={acceptingId === invite.id}
                  />
                ))}
              </div>
              {acceptError && (
                <p className="text-sm text-[var(--danger)] bg-[var(--bg-elevated)] border border-[var(--danger)] rounded-md px-3 py-2 mt-3">
                  {acceptError}
                </p>
              )}
            </div>
          )}

          {/* Create Project */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-6 shadow-sm">
            <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1">
              Create a new project
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Start fresh by creating your own project workspace.
            </p>
            <form onSubmit={handleCreateProject} className="flex flex-col gap-4" noValidate>
              <Input
                id="project-name"
                type="text"
                label="Project name"
                placeholder="My project"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                required
                disabled={creating}
              />

              {createError && (
                <p className="text-sm text-[var(--danger)] bg-[var(--bg-elevated)] border border-[var(--danger)] rounded-md px-3 py-2">
                  {createError}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={creating || !projectName.trim()}
                className="w-full mt-1"
              >
                {creating ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating…
                  </span>
                ) : (
                  "Create Project"
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
