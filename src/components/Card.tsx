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
      className={`rounded-md border border-border ${tint ? "bg-surface-tint" : "bg-surface"} ${padded ? "px-5 py-4" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
