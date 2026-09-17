// src/lib/scoring/relationshipScorer.ts
import "server-only";
import type { GroundTruth, ScoringSessionRelationship } from "./types.ts";

/** NEW category — no equivalent exists in Tools/EvidenceScorer/Program.cs
 *  (that tool scores evidence identification only). Built from the same
 *  source of truth Unity itself uses: RelationshipDefinition assets under
 *  Assets/_Project/Data/Relationships/** each carry isCorrect/scoreWeight,
 *  but have no "required" flag — every relationship a scenario's ground
 *  truth lists is therefore treated as required for full credit. A
 *  relationship counts as achieved when its final session_relationships.state
 *  is "Completed" (board-connected AND finalized via Submit Conclusion, per
 *  StoryContentTest's own "reached Completed after board connection + Submit
 *  Conclusion finalize" checks) — reaching only "Available" does not count. */
export interface RelationshipScoreOutput {
  relationshipAccuracy?: number;
  relationshipsCompleted: number;
  relationshipsTotal: number;
}

export function scoreRelationships(
  sessionRelationships: ScoringSessionRelationship[],
  groundTruth: GroundTruth,
): RelationshipScoreOutput {
  if (groundTruth.relationships.length === 0) {
    return { relationshipAccuracy: undefined, relationshipsCompleted: 0, relationshipsTotal: 0 };
  }

  const stateById = new Map(sessionRelationships.map((r) => [r.relationshipId, r.state] as const));

  let totalWeight = 0;
  let completedWeight = 0;
  let completedCount = 0;

  for (const rel of groundTruth.relationships) {
    totalWeight += rel.scoreWeight;
    if (stateById.get(rel.relationshipId) === "Completed") {
      completedWeight += rel.scoreWeight;
      completedCount++;
    }
  }

  return {
    relationshipAccuracy: totalWeight === 0 ? undefined : Math.round((completedWeight / totalWeight) * 10000) / 10000,
    relationshipsCompleted: completedCount,
    relationshipsTotal: groundTruth.relationships.length,
  };
}
