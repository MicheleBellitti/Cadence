"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { fetchUserProjects, type ProjectSummary } from "@/lib/firestore-sync";
import { getFirebaseDb, auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpen, Plus, Users, LogOut, ChevronRight } from "lucide-react";
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
            Joining...
          </span>
        ) : (
          "Join"
        )}
      </Button>
    </div>
  );
}

function ProjectCard({
  project,
  isOwner,
  onSelect,
}: {
  project: ProjectSummary;
  isOwner: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left p-4 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg transition-colors hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_5%,var(--bg-elevated))] group"
    >
      <div className="flex items-center gap-3">
        <div
          className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg"
          style={{
            backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)",
            color: "var(--accent)",
          }}
        >
          <FolderOpen size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {project.name}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-[var(--text-secondary)]">
              {isOwner ? "Owner" : "Member"}
            </span>
            <span className="text-[var(--text-tertiary)]">&middot;</span>
            <span className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
              <Users size={12} />
              {project.memberIds.length}
            </span>
          </div>
        </div>
        <ChevronRight
          size={18}
          className="shrink-0 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors"
        />
      </div>
    </button>
  );
}

export default function ProjectsPage() {
  const { user, signOut, pendingInvites, acceptInviteFn, createProject, selectProject } = useAuth();
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Create project form
  const [showCreate, setShowCreate] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Accept invite
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState("");

  // Fetch projects on mount.
  // After signIn, Firestore may reject queries until the auth token propagates.
  // Force-refresh the token first to ensure Firestore accepts the request,
  // then retry with exponential backoff as a safety net.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load(attempt = 0) {
      try {
        // On first attempt, force-refresh the ID token so Firestore security
        // rules see the authenticated user immediately.
        if (attempt === 0 && auth.currentUser) {
          await auth.currentUser.getIdToken(true);
        }

        const result = await fetchUserProjects(getFirebaseDb(), user!.uid);
        if (!cancelled) {
          setProjects(result);
          setFetchError("");
          setLoadingProjects(false);
        }
      } catch (err) {
        if (cancelled) return;
        if (attempt < 5) {
          setTimeout(() => load(attempt + 1), 500 * (attempt + 1));
        } else {
          setFetchError(err instanceof Error ? err.message : "Failed to load projects");
          setLoadingProjects(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user]);

  function handleSelectProject(projectId: string) {
    selectProject(projectId);
    router.push("/board");
  }

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
      const id = await createProject(name);
      selectProject(id);
      router.push("/board");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setCreating(false);
    }
  }

  async function handleAcceptInvite(inviteId: string, projectId: string) {
    setAcceptError("");
    setAcceptingId(inviteId);
    try {
      await acceptInviteFn(inviteId, projectId);
      // Refresh the project list
      if (user) {
        const result = await fetchUserProjects(getFirebaseDb(), user.uid);
        setProjects(result);
      }
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : "Failed to accept invite.");
    } finally {
      setAcceptingId(null);
    }
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col">
      {/* Top bar */}
      <header
        className="flex items-center justify-between px-6 h-14 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent)] text-white text-sm font-bold">
            C
          </div>
          <span className="text-sm font-semibold text-[var(--text-primary)]">Cadence</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--text-secondary)]">{user.email}</span>
          <button
            onClick={signOut}
            title="Sign out"
            className="flex items-center justify-center w-8 h-8 rounded-md transition-colors text-[var(--text-secondary)] hover:text-[var(--danger)] hover:bg-[var(--bg-elevated)]"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex justify-center px-4 py-10">
        <div className="w-full max-w-lg">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">Your projects</h1>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Select a project to open, or create a new one.
          </p>

          {/* Pending invites */}
          {pendingInvites.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                Pending invitations
              </h2>
              <div className="flex flex-col gap-2">
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
                <p className="text-sm text-[var(--danger)] mt-2">{acceptError}</p>
              )}
            </div>
          )}

          {/* Project list */}
          {loadingProjects ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : fetchError ? (
            <div className="text-center py-12">
              <p className="text-sm text-[var(--danger)] mb-3">{fetchError}</p>
              <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          ) : projects.length > 0 ? (
            <div className="flex flex-col gap-2 mb-6">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isOwner={project.ownerId === user.uid}
                  onSelect={() => handleSelectProject(project.id)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 mb-6 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl">
              <FolderOpen size={40} className="mx-auto text-[var(--text-tertiary)] mb-3" />
              <p className="text-sm text-[var(--text-secondary)] mb-1">No projects yet</p>
              <p className="text-xs text-[var(--text-tertiary)]">
                Create your first project to get started.
              </p>
            </div>
          )}

          {/* Create project */}
          {showCreate ? (
            <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
                New project
              </h2>
              <form onSubmit={handleCreateProject} className="flex flex-col gap-3">
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
                  <p className="text-sm text-[var(--danger)]">{createError}</p>
                )}
                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setShowCreate(false); setProjectName(""); setCreateError(""); }}
                    disabled={creating}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={creating || !projectName.trim()}
                  >
                    {creating ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Creating...
                      </span>
                    ) : (
                      "Create"
                    )}
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="md"
              onClick={() => setShowCreate(true)}
              className="w-full"
            >
              <Plus size={16} className="mr-2" />
              New project
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
