import {createRoot} from 'react-dom/client';
import {AppShell} from '../../src/components/AppShell';
import {ProfileManagement} from '../../src/components/ProfileManagement';
import {AppearanceSync} from '../../src/components/AppearanceSync';
const role=(new URLSearchParams(location.search).get('role')??'student') as 'student'|'instructor'|'admin';
const name='Maria Cristina de los Santos Reyes';
createRoot(document.getElementById('preview')!).render(<><AppearanceSync/><AppShell role={role} name={name} onSignOut={async()=>{}}><ProfileManagement profile={{id:'synthetic-user',role,fullName:name,studentId:role==='student'?'2026-001':null,section:role==='student'?'A':null,email:role==='student'?null:'instructor@university.example'}}/></AppShell></>);
