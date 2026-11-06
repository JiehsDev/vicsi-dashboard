"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { Home, ClipboardList, BookOpen, LogOut, UserRound, UsersRound, ChevronDown,ShieldCheck,History,KeyRound } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { BrandLogo } from "./BrandLogo";
import { ConfirmSubmitButton } from "./ConfirmSubmitButton";

export function AppShell({ role, name, classes=[], onSignOut, children }: {
  role: "student" | "instructor" | "admin"; name: string; classes?:Array<{id:string;name:string;section:string|null;archivedAt:string|null}>; onSignOut?: () => Promise<void>; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [classesOpen,setClassesOpen]=useState(true);
  const classListId=useId();
  const classLinks=[...classes].sort((a,b)=>Number(!!a.archivedAt)-Number(!!b.archivedAt)||a.name.localeCompare(b.name)||(a.section??"").localeCompare(b.section??""));
  function toggleClasses(event:React.MouseEvent<HTMLButtonElement>) {
    const sidebar=event.currentTarget.closest("aside");
    if(sidebar && sidebar.getBoundingClientRect().width<100){
      setCollapsed(window.matchMedia("(max-width:780px)").matches);
      setClassesOpen(true);
    } else setClassesOpen(value=>!value);
  }
  const base = role === "admin"?"/admin":role === "student" ? "/results/home" : "/class-results";
  const links = role === "admin"?[
    {label:"Overview",href:"/admin",icon:ShieldCheck},
    {label:"Users",href:"/admin/users",icon:UsersRound},
    {label:"Instructor invitations",href:"/admin/invitations",icon:UserRound},
    {label:"Administrator access",href:"/admin/access",icon:KeyRound},
    {label:"Activity log",href:"/admin/activity",icon:History},
  ]:role === "student" ? [
    {label:"Home", href:"/results/home", icon:Home},
    {label:"My Sessions", href:"/results", icon:ClipboardList},
    {label:"My Classes", href:"/results/classes", icon:UsersRound},
    {label:"How to Play", href:"/results/guide", icon:BookOpen},
  ] : [{label:"Recent Sessions", href:"/class-results", icon:ClipboardList}];
  function destination(href:string) {
    const query = pathname === href ? new URLSearchParams(params.toString()) : new URLSearchParams();
    query.delete("view");
    return `${href}${query.size ? `?${query}` : ""}`;
  }
  return <div className={`application ${role === "student" ? "student-workspace" : ""} ${collapsed ? "nav-collapsed" : ""}`}>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <aside className="app-sidebar" aria-label="Workspace navigation">
      <Link href={base} className="app-brand" aria-label="ViCSI dashboard home"><BrandLogo/><span className="brand-caption nav-copy">INVESTIGATION DASHBOARD</span></Link>
      <div className="workspace-label nav-copy">{role === "admin"?"System administration":role === "student" ? "Student workspace" : "Instructor workspace"}</div>
      <div className="sidebar-scroll"><nav aria-label={role === "admin"?"Administration":role === "student" ? "Student pages" : "Results"}>{links.map(({label,href,icon:Icon}) => {
        const active=pathname===href || (href.startsWith('/admin/')&&pathname.startsWith(href+'/')) || (href==="/results/classes"&&pathname.startsWith("/results/classes/")) || (href==="/results" && pathname.startsWith("/results/") && !["/results/home","/results/guide","/results/classes"].some(path=>pathname===path||pathname.startsWith(path+"/")));
        return <Link key={href} href={destination(href)} title={label} aria-label={label} aria-current={active ? "page" : undefined} className="sidebar-link"><Icon size={18} aria-hidden="true" className="nav-icon"/><span className="nav-copy">{label}</span></Link>;
      })}</nav>
      {role === "instructor" && <nav className="management-nav" aria-label="Course management">
        <button className="sidebar-link class-group-toggle" type="button" aria-label="Classes" title="Classes" aria-expanded={classesOpen} aria-controls={classListId} onClick={toggleClasses}><UsersRound size={18} aria-hidden="true" className="nav-icon"/><span className="nav-copy">Classes</span><ChevronDown size={16} aria-hidden="true" className={`class-group-chevron nav-copy${classesOpen?" is-open":""}`}/></button>
        <div id={classListId} className="sidebar-class-list" hidden={!classesOpen}>
          <Link className="sidebar-class-link all-classes-link" href="/classes" aria-current={pathname==="/classes"||pathname==="/classes/new"?"page":undefined}>All classes</Link>
          {classLinks.length?<ul>{classLinks.map(item=>{
            const href=`/classes/${encodeURIComponent(item.id)}`;
            const active=pathname===href||pathname.startsWith(`${href}/`);
            const section=item.section?.trim();
            const detail=[section?(/^section\b/i.test(section)?section:`Section ${section}`):null,item.archivedAt?"Archived":null].filter(Boolean).join(" · ");
            return <li key={item.id}><Link className="sidebar-class-link" href={href} aria-current={active?"page":undefined} title={[item.name,detail].filter(Boolean).join(" · ")}><span className="sidebar-class-name">{item.name}</span>{detail&&<span className="sidebar-class-detail">{detail}</span>}</Link></li>;
          })}</ul>:<p className="sidebar-classes-empty">No classes available.</p>}
        </div>
      </nav>}
      </div>
      <nav className="profile-sidebar-link" aria-label="Your account"><Link href="/profile" className="sidebar-link" title="My Profile" aria-label="My Profile" aria-current={pathname==='/profile'?'page':undefined}><UserRound size={18} aria-hidden="true" className="nav-icon"/><span className="nav-copy">My Profile</span></Link></nav>
      <div className="sidebar-footer"><span className="nav-copy">Forensic investigation<br/>Evidence. Interpretation. Reflection.</span><button type="button" className="collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar" title="Toggle sidebar">&#9776;</button></div>
    </aside>
    <div className="app-workspace">
      <header className="app-header">
        <div className="header-workspace"><span className="header-brand">ViCSI</span><span className="header-slash" aria-hidden="true">/</span><span className="header-context">{role === "admin"?"System administration":role === "student" ? "Learning record" : "Teaching & assessment"}</span></div>
        <div className="header-account">
          <Link href="/profile" className="header-identity" title="Manage your profile"><span className="header-avatar" aria-hidden="true"><UserRound size={18}/></span><div><span className="header-role">{role === "admin"?"Administrator":role === "student" ? "Student" : "Instructor"}</span><span className="header-name">{name}</span></div></Link>
          <div className="header-controls"><div className="theme-control"><ThemeToggle/></div>{onSignOut && <form action={onSignOut}><ConfirmSubmitButton className="signout-button" title="Sign out of ViCSI?" confirmMessage="You’ll return to the sign-in page. You can sign in again to access your dashboard." confirmLabel="Sign out"><LogOut size={16} aria-hidden="true"/><span>Sign out</span></ConfirmSubmitButton></form>}</div>
        </div>
      </header>
      <main id="main-content" className="app-main">{children}</main>
    </div>
  </div>;
}
