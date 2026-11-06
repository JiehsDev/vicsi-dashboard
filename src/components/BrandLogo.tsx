/** Use the supplied artwork intact; compact navigation focuses on its emblem. */
export function BrandLogo({ className = "" }: { className?: string }) {
  return <span className={`vicsi-logo ${className}`} role="img" aria-label="ViCSI - Virtual Crime Scene Investigation">
    <span className="vicsi-logo-art vicsi-logo-full" aria-hidden="true"/>
    <span className="vicsi-logo-art vicsi-logo-symbol" aria-hidden="true"/>
    <span className="brand-wordmark" aria-hidden="true">ViCSI</span>
  </span>;
}
