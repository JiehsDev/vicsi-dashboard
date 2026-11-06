import {Suspense} from 'react';
import {requireSystemAdmin} from '@/lib/admin';
import {AppShell} from '@/components/AppShell';
import {signOut} from '@/app/login/actions';
export default async function AdminLayout({children}:{children:React.ReactNode}){
 const {identity}=await requireSystemAdmin();
 return <Suspense fallback={<p className="p-8">Loading administration…</p>}><AppShell role="admin" name={identity.full_name} onSignOut={signOut}>{children}</AppShell></Suspense>;
}
