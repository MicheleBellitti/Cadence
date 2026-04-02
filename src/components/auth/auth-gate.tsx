"use client";

import { useAuth } from "./auth-provider";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

const PUBLIC_ROUTES = ["/login", "/register"];
const PROJECT_PICKER_ROUTE = "/projects";

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isPublic = PUBLIC_ROUTES.includes(pathname);
  const isProjectPicker = pathname === PROJECT_PICKER_ROUTE;

  useEffect(() => {
    if (loading) return;

    if (user === undefined && !isPublic) {
      // Not authenticated — redirect to login
      router.replace("/login");
    } else if (user && isPublic) {
      // Authenticated on a public route — redirect to project picker
      router.replace("/projects");
    } else if (user && user.projectId === null && !isPublic && !isProjectPicker) {
      // Authenticated but no project selected — redirect to project picker
      router.replace("/projects");
    }
  }, [user, loading, isPublic, isProjectPicker, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--text-secondary)]">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated on a protected route — wait for redirect
  if (user === undefined && !isPublic) return null;

  // Authenticated on a public route — wait for redirect
  if (user && isPublic) return null;

  // Authenticated but no project — only allow /projects
  if (user && user.projectId === null && !isPublic && !isProjectPicker) return null;

  return <>{children}</>;
}
