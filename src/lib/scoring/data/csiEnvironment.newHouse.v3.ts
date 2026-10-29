import "server-only";
import type { MeasurementRequirementRule } from "../types.ts";

/** Aligned tape hooks; body/blood use the foot-side wall. Frozen new-house-v3 geometry. */
export const CSI_NEW_HOUSE_MEASUREMENTS_V3: MeasurementRequirementRule[] = [
  { requirementId: "MEAS-BODY-A", evidenceId: "BODY-A", referenceAId: "REF-BODYA-1", referenceBId: "REF-BODYA-2", expectedDistanceA: 2.0668297, expectedDistanceB: 1.2679882, tolerance: 0.1 },
  { requirementId: "MEAS-EVD-014", evidenceId: "EVD-014", referenceAId: "REF-KNIFE-1", referenceBId: "REF-KNIFE-CAB", expectedDistanceA: 0.78982925, expectedDistanceB: 1.7470102, tolerance: 0.1 },
  { requirementId: "MEAS-EVD-015", evidenceId: "EVD-015", referenceAId: "REF-SPATTER-CAB", referenceBId: "REF-SPATTER-2", expectedDistanceA: 1.0119886, expectedDistanceB: 1.7581711, tolerance: 0.1 },
  { requirementId: "MEAS-EVD-018", evidenceId: "EVD-018", referenceAId: "REF-BOTTLE-1", referenceBId: "REF-BOTTLE-2", expectedDistanceA: 0.33201122, expectedDistanceB: 0.59127235, tolerance: 0.1 },
];
