/** Use the supplied artwork intact; compact navigation focuses on its emblem. */
export function BrandLogo({ className = "" }: { className?: string }) {
  return <span className={`vicsi-logo ${className}`} role="img" aria-label="ViCSI - Virtual Crime Scene Investigation">
    <svg className="vicsi-logo-full" viewBox="85 132 239 156" aria-hidden="true" focusable="false">
      <image href="/brand/vicsi-logo.png?v=5.5" width="412" height="412"/>
    </svg>
    <svg className="vicsi-logo-symbol" viewBox="85 132 239 156" aria-hidden="true" focusable="false">
      <image href="/brand/vicsi-logo.png?v=5.5" width="412" height="412"/>
    </svg>
    <span className="brand-wordmark" aria-hidden="true">ViCSI</span>
  </span>;
}
