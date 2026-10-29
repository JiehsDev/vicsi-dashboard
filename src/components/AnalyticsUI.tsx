import Link from "next/link";

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</div>;
}
export function Section({ id, title, description, children, aside }: { id?: string; title: string; description?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return <section id={id} className="analysis-section"><div className="section-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{aside}</div>{children}</section>;
}
export function EmptyState({ title = "No records yet", children }: { title?: string; children: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-rule" aria-hidden="true"/><h3>{title}</h3><p>{children}</p></div>;
}
export function Status({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "review" }) {
  return <span className={`status status-${tone}`}>{children}</span>;
}
export function MetricStrip({ metrics }: { metrics: Array<{ label: string; value: string | number; note?: string }> }) {
  return <dl className="metric-strip">{metrics.map(m => <div key={m.label}><dt>{m.label}</dt><dd>{m.value}</dd>{m.note && <p>{m.note}</p>}</div>)}</dl>;
}
export function BarList({ rows, empty = "No assessed observations in this selection.", countLabel = "records" }: { rows: Array<{ id: string; label: string; value: number; maximum?: number; detail?: string; href?: string }>; empty?: string; countLabel?: string }) {
  if (!rows.length) return <EmptyState>{empty}</EmptyState>;
  const max = Math.max(...rows.map(r => r.maximum ?? r.value), 1);
  return <ul className="bar-list">{rows.map(r => <li key={r.id}><div className="bar-label"><span>{r.href ? <Link href={r.href}>{r.label}</Link> : r.label}</span><strong>{r.value}{r.maximum !== undefined ? ` / ${r.maximum}` : ` ${countLabel}`}</strong></div><div className="bar-track" role="img" aria-label={`${r.label}: ${r.value}${r.maximum !== undefined ? ` out of ${r.maximum}` : ` ${countLabel}`}`}><span style={{ width: `${Math.max(0, Math.min(100, r.value / (r.maximum || max) * 100))}%` }}/></div>{r.detail && <p>{r.detail}</p>}</li>)}</ul>;
}
export function LoadingWorkspace() {
  return <div className="loading-workspace" role="status" aria-live="polite"><p>Loading investigation records…</p><div className="skeleton-line"/><div className="skeleton-block"/><div className="skeleton-block"/></div>;
}
export function dateLabel(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Date not recorded";
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
}
