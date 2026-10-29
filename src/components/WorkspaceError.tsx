"use client";
export function WorkspaceError({reset}:{reset:()=>void}) {
 return <div role="alert" className="empty-state"><h2>Investigation records could not be loaded</h2><p>Please retry. Your saved investigation data has not changed.</p><button className="button mt-4" onClick={reset}>Try again</button></div>;
}
