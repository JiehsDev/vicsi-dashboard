import "server-only";
import type { MeasurementRequirementRule } from "../types.ts";

/** Rear ground-floor kitchen. Baked from Unity's saved new-house-v1 layout.
 * Append a new ID when geometry changes; never edit this profile for an existing run. */
export const CSI_NEW_HOUSE_MEASUREMENTS_V1: MeasurementRequirementRule[] = [
  { requirementId: "MEAS-BODY-A", evidenceId: "BODY-A", referenceAId: "REF-BODYA-1", referenceBId: "REF-BODYA-2", expectedDistanceA: 2.067, expectedDistanceB: 1.171, tolerance: 0.1 },
  { requirementId: "MEAS-EVD-014", evidenceId: "EVD-014", referenceAId: "REF-KNIFE-1", referenceBId: "REF-KNIFE-CAB", expectedDistanceA: 0.596588, expectedDistanceB: 0.65503, tolerance: 0.1 },
  { requirementId: "MEAS-EVD-015", evidenceId: "EVD-015", referenceAId: "REF-SPATTER-CAB", referenceBId: "REF-SPATTER-2", expectedDistanceA: 0.954001, expectedDistanceB: 1.094999, tolerance: 0.1 },
  { requirementId: "MEAS-EVD-018", evidenceId: "EVD-018", referenceAId: "REF-BOTTLE-1", referenceBId: "REF-BOTTLE-2", expectedDistanceA: 0.332, expectedDistanceB: 0.594, tolerance: 0.1 },
];
