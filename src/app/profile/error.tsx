'use client';
export default function ProfileError({reset}:{reset:()=>void}){
  return <main className="p-8"><h1>Profile unavailable</h1><p>Your account details could not be loaded. No profile change has been made by this page.</p><button className="button" onClick={reset}>Try again</button></main>;
}
