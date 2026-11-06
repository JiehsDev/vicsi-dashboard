export function Spinner(){return <span className="loading-spinner" aria-hidden="true"/>;}
export function LoadingStatus({children}:{children:React.ReactNode}){
  return <span className="loading-status" role="status" aria-live="polite"><Spinner/>{children}</span>;
}
export function LoadingPanel({label='Loading investigation records…',fullPage=false}:{label?:string;fullPage?:boolean}){
  return <div className={`loading-workspace${fullPage?' loading-full-page':''}`} aria-busy="true">
    <LoadingStatus>{label}</LoadingStatus>
    <p className="loading-explanation">Please wait while we retrieve this view.</p>
    <div className="loading-placeholder" aria-hidden="true"><div className="skeleton-line"/><div className="skeleton-block"/><div className="skeleton-block"/></div>
  </div>;
}
