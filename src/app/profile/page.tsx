import {Suspense} from 'react';
import {AppShell} from '@/components/AppShell';
import {ProfileManagement} from '@/components/ProfileManagement';
import {createProfileBackend} from '@/lib/profileServer';
import {getInstructorClasses} from '@/lib/classes';
import {signOut} from '@/app/login/actions';

export default async function ProfilePage(){
  const backend=await createProfileBackend();
  const profile=await backend.identity();
  if(!profile)throw new Error('Account profile unavailable');
  const classes=profile.role==='instructor'?await getInstructorClasses():[];
  return <Suspense fallback={<p>Loading your profile…</p>}><AppShell role={profile.role} name={profile.fullName} classes={classes} onSignOut={signOut}>
    <ProfileManagement profile={{...profile,email:profile.role==='student'?null:profile.email}}/>
  </AppShell></Suspense>;
}
