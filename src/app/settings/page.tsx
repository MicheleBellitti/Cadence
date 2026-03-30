"use client";

import { loadSeedData } from "@/lib/seed-data";

export default function SettingsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Settings</h1>
      <p className="mt-2 text-[var(--text-secondary)]">Settings view coming soon.</p>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Developer Tools</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Load sample data to explore the app with a realistic project.
        </p>
        <button
          className="mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          onClick={() => {
            if (window.confirm("This will replace all current data. Continue?")) {
              loadSeedData();
            }
          }}
        >
          Load Sample Data
        </button>
      </div>
    </div>
  );
}
