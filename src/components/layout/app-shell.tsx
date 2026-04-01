"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Navbar } from "./navbar";
import { MainContent } from "./main-content";

const PUBLIC_ROUTES = ["/login", "/register"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  if (isPublic) {
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
