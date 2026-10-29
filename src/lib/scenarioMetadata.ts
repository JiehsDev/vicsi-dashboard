/** Public title from the audited Unity Scenario_CSI_Environment.asset (2026-10-17).
 * A stale deployed scenarios row must not rename this version's investigation.
 * Unknown and historical version tuples retain their stored registry title.
 */
export function scenarioTitle(id:string,version:string,groundTruth:string|null|undefined,fallback:string):string {
  return id==="CSI-ENVIRONMENT-001" && version==="1.1.0" && groundTruth==="1.2.0" ? "The Last Drink" : fallback;
}
