"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

export function AppShell({ role, name, onSignOut, children }: {
  role: "student" | "instructor"; name: string; onSignOut?: () => Promise<void>; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const base = role === "student" ? "/results" : "/class-results";
  const links = role === "student" ? [["My Sessions", "sessions"]] : [["Class Results", "sessions"]];
  const view = "sessions";
  function destination() {
    const query = pathname === base ? new URLSearchParams(params.toString()) : new URLSearchParams();
    query.delete("view");
    return `${base}?${query}`;
  }
  return <div className={`application ${collapsed ? "nav-collapsed" : ""}`}>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <aside className="app-sidebar" aria-label="Workspace navigation">
      <Link href={base} className="app-brand"><span className="brand-mark">V</span><span className="nav-copy">ViCSI<span className="brand-caption">CASE LEARNING LAB</span></span></Link>
      <div className="workspace-label nav-copy">{role === "student" ? "Student workspace" : "Instructor workspace"}</div>
      <nav>{links.map(([label, next], index) => <Link key={next} href={destination()} title={collapsed ? label : undefined} aria-label={label} aria-current={pathname === base && view === next ? "page" : undefined} className="sidebar-link"><span className="nav-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span className="nav-copy">{label}</span></Link>)}</nav>
      {role === "instructor" && <nav className="management-nav" aria-label="Course management"><span className="workspace-label nav-copy">Manage</span>{[["Classes", "/classes"], ["Assignments", "/assignments"]].map(([label, href]) => <Link className="sidebar-link" key={href} href={href} aria-label={label} aria-current={pathname.startsWith(href) ? "page" : undefined}><span className="nav-index" aria-hidden="true">{label.slice(0, 1)}</span><span className="nav-copy">{label}</span></Link>)}</nav>}
      <div className="sidebar-footer"><span className="nav-copy">Forensic investigation<br/>Evidence. Interpretation. Reflection.</span><button type="button" className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar" title="Toggle sidebar">&#9776;</button></div>
    </aside>
    <div className="app-workspace">
      <header className="app-header"><span>ViCSI <span className="header-slash">/</span> {role === "student" ? "Learning record" : "Teaching & assessment"}</span><div className="header-account"><span>{name}</span>{onSignOut && <form action={onSignOut}><button type="submit">Sign out</button></form>}</div></header>
      <main id="main-content" className="app-main">{children}</main>
    </div>
  </div>;
}
