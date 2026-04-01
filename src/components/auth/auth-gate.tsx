"use client";

import { useAuth } from "./auth-provider";
import { NoProjectScreen } from "./no-project-screen";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

const PUBLIC_ROUTES = ["/login", "/register"];

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isPublic = PUBLIC_ROUTES.includes(pathname);

  useEffect(() => {
    if (loading) return;

    if (user === undefined && !isPublic) {
      router.replace("/login");
    } else if (user && isPublic) {
      router.replace("/board");
    }
  }, [user, loading, isPublic, router]);

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

  if (user === undefined && !isPublic) {
    return null;
  }

  if (user && isPublic) {
    return null;
  }

  // Authenticated but no project assigned yet — show the project setup screen
  if (user && user.projectId === null && !isPublic) {
    return <NoProjectScreen />;
  }

  return <>{children}</>;
}
