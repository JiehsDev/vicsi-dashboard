// Browser test entry only. Router adapters isolate the real AppShell component.
import {createRoot} from "react-dom/client";
import {AppShell} from "../../src/components/AppShell";
createRoot(document.getElementById("preview")!).render(<AppShell role="student" name="Sample learner" onSignOut={async()=>{document.body.dataset.signedOut="true";}}><h1>Interactive navigation check</h1><p>Local component test; no session or authentication requests.</p></AppShell>);
