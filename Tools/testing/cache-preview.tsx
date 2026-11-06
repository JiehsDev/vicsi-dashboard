import {createRoot} from 'react-dom/client';
import {DashboardLiveUpdates} from '../../src/components/DashboardLiveUpdates';
createRoot(document.getElementById('preview')!).render(<><main className="p-6"><h1>Saved investigation view</h1><p id="cached-record">Existing session score: 100%</p><label>Editable note<input id="editing-note" defaultValue="Unsaved note"/></label><dialog id="editing-dialog"><p>Editing class details</p></dialog></main><DashboardLiveUpdates/></>);
