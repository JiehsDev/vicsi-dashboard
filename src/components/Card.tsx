// src/components/Card.tsx

export function Card({
  className = "",
  padded = true,
  tint = false,
  children,
}: {
  className?: string;
  padded?: boolean;
  /** Use the warm off-white fill (stat tiles, section panels) instead of
   *  pure white (roster table, nav bar). */
  tint?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-border ${tint ? "bg-surface-tint" : "bg-surface"} ${padded ? "px-6 py-5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
