"use client";
import { useState, useEffect, useCallback } from "react";
import { useTeam, useProjectStore, useProjectId } from "@/stores/project-store";
import { useAuth } from "@/components/auth/auth-provider";
import type { TeamMember, Invite } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createInvite, getPendingInvitesForProject } from "@/lib/invite";


const PRESET_COLORS = [
  "#2563EB",
  "#7C3AED",
  "#059669",
  "#DC2626",
  "#D97706",
  "#0891B2",
  "#4F46E5",
  "#BE185D",
];

const COLOR_OPTIONS = PRESET_COLORS.map((c) => ({ value: c, label: c }));

interface MemberFormState {
  name: string;
  role: string;
  color: string;
  hoursPerDay: number;
}

function emptyForm(): MemberFormState {
  return { name: "", role: "", color: PRESET_COLORS[0], hoursPerDay: 8 };
}

interface MemberFormProps {
  initial?: MemberFormState;
  onSave: (data: MemberFormState) => void;
  onCancel: () => void;
  saveLabel?: string;
}

function MemberForm({ initial, onSave, onCancel, saveLabel = "Save" }: MemberFormProps) {
  const [form, setForm] = useState<MemberFormState>(initial ?? emptyForm());

  function set(key: keyof MemberFormState, value: string | number) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({ ...form, name: form.name.trim(), role: form.role.trim() });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-4 space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <Input
          id="member-name"
          label="Name"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Alice"
          required
        />
        <Input
          id="member-role"
          label="Role"
          value={form.role}
          onChange={(e) => set("role", e.target.value)}
          placeholder="e.g. Engineer"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[var(--text-secondary)]">
            Color
          </label>
          <div className="flex items-center gap-2">
            <span
              className="w-5 h-5 rounded-full flex-shrink-0 border border-[var(--border)]"
              style={{ backgroundColor: form.color }}
            />
            <select
              value={form.color}
              onChange={(e) => set("color", e.target.value)}
              className="flex-1 px-3 py-1.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-colors duration-150 cursor-pointer"
            >
              {COLOR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Input
          id="member-hours"
          label="Hours / Day"
          type="number"
          min={1}
          max={24}
          value={form.hoursPerDay}
          onChange={(e) =>
            set("hoursPerDay", Math.max(1, parseInt(e.target.value, 10) || 8))
          }
        />
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm">
          {saveLabel}
        </Button>
      </div>
    </form>
  );
}

interface MemberCardProps {
  member: TeamMember;
  onEdit: () => void;
  onDelete: () => void;
  isEditing: boolean;
  onSaveEdit: (data: MemberFormState) => void;
  onCancelEdit: () => void;
}

function MemberCard({
  member,
  onEdit,
  onDelete,
  isEditing,
  onSaveEdit,
  onCancelEdit,
}: MemberCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isEditing) {
    return (
      <MemberForm
        initial={{
          name: member.name,
          role: member.role,
          color: member.color,
          hoursPerDay: member.hoursPerDay,
        }}
        onSave={onSaveEdit}
        onCancel={onCancelEdit}
        saveLabel="Update"
      />
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg">
      {/* Color swatch */}
      <span
        className="w-8 h-8 rounded-full flex-shrink-0 border border-[var(--border)]"
        style={{ backgroundColor: member.color }}
      />
      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
          {member.name}
        </p>
        <p className="text-xs text-[var(--text-secondary)] truncate">
          {member.role || "No role"} &bull; {member.hoursPerDay}h/day
        </p>
      </div>
      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
        {confirmDelete ? (
          <>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setConfirmDelete(false);
                onDelete();
              }}
            >
              Confirm
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-[var(--danger)] hover:text-[var(--danger)]"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

function InviteSection() {
  const { user } = useAuth();
  const projectId = useProjectId();
  const projectName = useProjectStore((s) => s.project.name);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState<
    { type: "success"; message: string } | { type: "error"; message: string } | null
  >(null);
  const [sending, setSending] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);

  const loadPendingInvites = useCallback(async () => {
    if (!projectId) return;
    setLoadingInvites(true);
    try {
      const invites = await getPendingInvitesForProject(projectId);
      setPendingInvites(invites);
    } catch {
      // Silently ignore — invites list is informational
    } finally {
      setLoadingInvites(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadPendingInvites();
  }, [loadPendingInvites]);

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !projectId || !user) return;

    setSending(true);
    setInviteStatus(null);

    try {
      await createInvite(projectId, inviteEmail.trim(), user.uid, projectName);
      setInviteStatus({
        type: "success",
        message: `Invite sent to ${inviteEmail.trim()}`,
      });
      setInviteEmail("");
      void loadPendingInvites();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send invite";
      setInviteStatus({ type: "error", message });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
        Invite Member
      </h2>

      <form
        onSubmit={(e) => { void handleSendInvite(e); }}
        className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-4 space-y-3"
      >
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Input
              id="invite-email"
              label="Email address"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
              required
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={sending || !inviteEmail.trim()}
          >
            {sending ? "Sending…" : "Send Invite"}
          </Button>
        </div>

        {inviteStatus && (
          <p
            className={`text-sm px-3 py-2 rounded-md ${
              inviteStatus.type === "success"
                ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
            }`}
          >
            {inviteStatus.message}
          </p>
        )}
      </form>

      {/* Pending invites list */}
      {loadingInvites ? (
        <p className="text-sm text-[var(--text-secondary)] mt-3">
          Loading pending invites…
        </p>
      ) : pendingInvites.length > 0 ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-[var(--text-secondary)]">
            Pending invites
          </p>
          {pendingInvites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center gap-3 px-4 py-2.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg"
            >
              <span className="flex-1 text-sm text-[var(--text-primary)] truncate">
                {invite.email}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400 flex-shrink-0">
                Pending
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function TeamManager() {
  const team = useTeam();
  const addTeamMember = useProjectStore((s) => s.addTeamMember);
  const updateTeamMember = useProjectStore((s) => s.updateTeamMember);
  const removeTeamMember = useProjectStore((s) => s.removeTeamMember);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  function handleAdd(data: MemberFormState) {
    addTeamMember(data);
    setShowAddForm(false);
  }

  function handleSaveEdit(id: string, data: MemberFormState) {
    updateTeamMember(id, data);
    setEditingId(null);
  }

  return (
    <>
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Team Members
          </h2>
          {!showAddForm && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setShowAddForm(true);
                setEditingId(null);
              }}
            >
              + Add Member
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {team.length === 0 && !showAddForm && (
            <p className="text-sm text-[var(--text-secondary)] py-4 text-center bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl">
              No team members yet. Add one to get started.
            </p>
          )}

          {team.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              isEditing={editingId === member.id}
              onEdit={() => {
                setEditingId(member.id);
                setShowAddForm(false);
              }}
              onDelete={() => removeTeamMember(member.id)}
              onSaveEdit={(data) => handleSaveEdit(member.id, data)}
              onCancelEdit={() => setEditingId(null)}
            />
          ))}

          {showAddForm && (
            <MemberForm
              onSave={handleAdd}
              onCancel={() => setShowAddForm(false)}
              saveLabel="Add Member"
            />
          )}
        </div>
      </section>

      <InviteSection />
    </>
  );
}
