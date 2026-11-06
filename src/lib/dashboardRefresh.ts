export const DASHBOARD_REFRESH_MS=5000;
export const DASHBOARD_AUTH_CHANNEL='vicsi-dashboard-auth-change';
export function isPublicDashboardPath(path:string){return ['/login','/signup','/account/setup'].includes(path);}
export type RevisionSnapshot={scope:string;revision:string};
export function validRevisionSnapshot(value:unknown):value is RevisionSnapshot{
  if(!value||typeof value!=='object')return false;
  const v=value as RevisionSnapshot;return /^[a-f0-9]{64}$/.test(v.scope)&&/^[a-f0-9]{64}$/.test(v.revision);
}
/** Memory-only tracking; no records, credentials or serialized pages live here. */
export class DashboardRefreshState {
  scope:string|null=null;
  revision:string|null=null;
  private views=new Map<string,string>();
  accept(snapshot:RevisionSnapshot,view='default'):'baseline'|'unchanged'|'changed'|'identity-changed'{
    if(this.scope && this.scope!==snapshot.scope)return 'identity-changed';
    if(!this.scope){this.applied(snapshot,view);return 'baseline';}
    if(!this.views.has(view))this.remember(view,this.revision!);
    if(this.views.get(view)===snapshot.revision)return 'unchanged';
    return 'changed';
  }
  private remember(view:string,revision:string){this.views.set(view,revision);if(this.views.size>40)this.views.delete(this.views.keys().next().value!);}
  applied(snapshot:RevisionSnapshot,view='default'){this.scope=snapshot.scope;this.revision=snapshot.revision;this.remember(view,snapshot.revision);}
  clear(){this.scope=null;this.revision=null;this.views.clear();}
}
export function shouldDeferDashboardRefresh(doc:Document){
  if(doc.hidden||doc.querySelector('dialog[open],form [aria-busy="true"]'))return true;
  const focused=doc.activeElement;
  return focused instanceof HTMLElement&&focused.matches('input,textarea,select,[contenteditable="true"]');
}
