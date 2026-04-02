"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Navbar } from "./navbar";
import { MainContent } from "./main-content";

const SHELL_BYPASS_ROUTES = ["/login", "/register", "/projects"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bypassShell = SHELL_BYPASS_ROUTES.includes(pathname);

  if (bypassShell) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <Navbar />
      <MainContent>{children}</MainContent>
    </>
  );
}
