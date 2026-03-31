"use client";
import { ProjectSettings } from "@/components/settings/project-settings";
import { TeamManager } from "@/components/settings/team-manager";
import { SprintManager } from "@/components/settings/sprint-manager";
import { DataManager } from "@/components/settings/data-manager";

export default function SettingsPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Settings</h1>
      <ProjectSettings />
      <TeamManager />
      <SprintManager />
      <DataManager />
    </div>
  );
}
