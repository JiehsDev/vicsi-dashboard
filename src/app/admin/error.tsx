"use client";
export default function AdminError({reset}:{reset:()=>void}){return <div className="admin-plain-empty"><h1>Administration records could not be loaded</h1><p>Your changes have not been retried. Check the connection and try loading the page again.</p><button className="button" type="button" onClick={reset}>Try again</button></div>;}
