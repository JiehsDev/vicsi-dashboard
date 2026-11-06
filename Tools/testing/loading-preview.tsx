import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PendingForm,SubmitButton} from '../../src/components/SubmitButton';
import {ManageClassButton} from '../../src/components/ManageClassButton';
import {ConfirmSubmitButton} from '../../src/components/ConfirmSubmitButton';
import {LoadingPanel} from '../../src/components/LoadingFeedback';
import Link from '../../src/components/LoadingLink';
function Preview(){
  const [count,setCount]=useState(0),[notice,setNotice]=useState('');
  const wait=async()=>{document.documentElement.dataset.submissions=String(Number(document.documentElement.dataset.submissions??0)+1);setCount(n=>n+1);setNotice('');await new Promise<void>(resolve=>{
    (window as unknown as {finishSubmission:(success?:boolean)=>void}).finishSubmission=(success=true)=>{setNotice(success?'Saved successfully.':'Save failed. Try again.');resolve();};
  });};
  return <main className="p-6"><h1>Loading interaction preview</h1><p id="submission-count">{count}</p>{notice&&<p role="status">{notice}</p>}
    <form id="loading-signin" action={wait}><label>Name<input name="name" defaultValue="Synthetic learner" required/></label><SubmitButton className="button button-primary" pendingLabel="Signing in…">Sign in</SubmitButton></form>
    <ManageClassButton formId="loading-class"><PendingForm id="loading-class" action={wait}><label>Class name<input name="name" defaultValue="Demonstration class" required/></label></PendingForm></ManageClassButton>
    <form id="loading-signout" action={wait}><ConfirmSubmitButton className="button signout-button" title="Sign out of ViCSI?" confirmLabel="Sign out" confirmMessage="Sign out of this preview?">Sign out</ConfirmSubmitButton></form>
    <Link href="/destination" className="button">Open record</Link>
    <LoadingPanel label="Loading session details…"/>
  </main>;
}
createRoot(document.getElementById('preview')!).render(<Preview/>);
