"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Home, ClipboardList, BookOpen } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

export function AppShell({ role, name, onSignOut, children }: {
  role: "student" | "instructor"; name: string; onSignOut?: () => Promise<void>; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const base = role === "student" ? "/results/home" : "/class-results";
  const links = role === "student" ? [
    {label:"Home", href:"/results/home", icon:Home},
    {label:"My Sessions", href:"/results", icon:ClipboardList},
    {label:"How to Play", href:"/results/guide", icon:BookOpen},
  ] : [{label:"Class Results", href:"/class-results", icon:ClipboardList}];
  function destination(href:string) {
    const query = pathname === href ? new URLSearchParams(params.toString()) : new URLSearchParams();
    query.delete("view");
    return `${href}${query.size ? `?${query}` : ""}`;
  }
  return <div className={`application ${role === "student" ? "student-workspace" : ""} ${collapsed ? "nav-collapsed" : ""}`}>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <aside className="app-sidebar" aria-label="Workspace navigation">
      <Link href={base} className="app-brand"><span className="brand-mark">V</span><span className="nav-copy">ViCSI<span className="brand-caption">CASE LEARNING LAB</span></span></Link>
      <div className="workspace-label nav-copy">{role === "student" ? "Student workspace" : "Instructor workspace"}</div>
      <nav aria-label={role === "student" ? "Student pages" : "Results"}>{links.map(({label,href,icon:Icon}) => {
        const active=pathname===href || (href==="/results" && pathname.startsWith("/results/") && !["/results/home","/results/guide"].includes(pathname));
        return <Link key={href} href={destination(href)} title={label} aria-label={label} aria-current={active ? "page" : undefined} className="sidebar-link"><Icon size={18} aria-hidden="true" className="nav-icon"/><span className="nav-copy">{label}</span></Link>;
      })}</nav>
      {role === "instructor" && <nav className="management-nav" aria-label="Course management"><span className="workspace-label nav-copy">Manage</span>{[["Classes", "/classes"], ["Assignments", "/assignments"]].map(([label, href]) => <Link className="sidebar-link" key={href} href={href} aria-label={label} aria-current={pathname.startsWith(href) ? "page" : undefined}><span className="nav-index" aria-hidden="true">{label.slice(0, 1)}</span><span className="nav-copy">{label}</span></Link>)}</nav>}
      <div className="sidebar-footer"><span className="nav-copy">Forensic investigation<br/>Evidence. Interpretation. Reflection.</span><button type="button" className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar" title="Toggle sidebar">&#9776;</button></div>
    </aside>
    <div className="app-workspace">
      <header className="app-header"><span>ViCSI <span className="header-slash">/</span> {role === "student" ? "Learning record" : "Teaching & assessment"}</span><div className="header-account"><span>{name}</span><div className="theme-control"><ThemeToggle/></div>{onSignOut && <form action={onSignOut}><button type="submit">Sign out</button></form>}</div></header>
      <main id="main-content" className="app-main">{children}</main>
    </div>
  </div>;
}
