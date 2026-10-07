// src/lib/scoring/verify.ts
import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { scoreEvidence } from "./evidenceScorer.ts";
import { scoreRelationships } from "./relationshipScorer.ts";
import { scoreProcedural } from "./proceduralScorer.ts";
import { scoreConclusion } from "./conclusionScorer.ts";
import { computeOverallScore } from "./overallScore.ts";
import { scoreScenePhotography } from "./scenePhotographyScorer.ts";
import { scoreMeasurement } from "./measurementScorer.ts";
import { scoreProcedureOrder } from "./procedureOrderScorer.ts";
import { resolveSessionScoring } from "./registry.ts";
import type { ScoreCategories, ScoringSessionEvent } from "./types.ts";

export interface VerifyOutcome {
  status: "verified" | "verification_failed" | "requires_review";
  message?: string;
  categories?: ScoreCategories;
  overallScore?: number;
}

/** The full verification pipeline for one already-stored session (Part 4):
 *  load ordered events + children, select ground truth/rules by version,
 *  score, persist atomically, flip verification_status. Idempotent — the
 *  underlying storage RPC upserts on (session_id, category_key, source), so
 *  calling this twice for the same session updates the same rows rather
 *  than duplicating them.
 *
 *  Never overwrites the original event log or any client-reported score
 *  column — only ever writes to session_score_categories (source='server')
 *  and the verified_score/verification_status/verification_message/
 *  verified_at_utc columns on assessment_sessions. */
export async function verifySession(sessionId: string): Promise<VerifyOutcome> {
  const admin = createSupabaseAdminClient();

  const { data: session, error: sessionError } = await admin
    .from("assessment_sessions")
    .select("session_id, scenario_id, selected_conclusion_id, resolved_ending_id, scoring_rules_version, ground_truth_version")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    return await fail(admin, sessionId, "verification_failed", "Session not found for verification.");
  }

  const { groundTruthVersion, scoringRulesVersion, groundTruth, scoringRules } = resolveSessionScoring(
    session.scenario_id,
    session.ground_truth_version,
    session.scoring_rules_version,
  );

  if (!groundTruth || !scoringRules) {
    return await fail(
      admin,
      sessionId,
      "requires_review",
      `No ground truth/scoring rules registered for scenario ${session.scenario_id} version ${groundTruthVersion ?? "(none)"}/${scoringRulesVersion ?? "(none)"}.`,
    );
  }

  const [eventsRes, relationshipsRes, violationsRes] = await Promise.all([
    admin.from("session_events").select("sequence_number, timestamp_ms, event_type, target_id, payload").eq("session_id", sessionId),
    admin.from("session_relationships").select("relationship_id, state, was_ever_selected").eq("session_id", sessionId),
    admin.from("session_procedure_violations").select("event_type").eq("session_id", sessionId),
  ]);

  if (eventsRes.error || relationshipsRes.error || violationsRes.error) {
    return await fail(admin, sessionId, "verification_failed", "Unable to load session data for verification.");
  }

  const events: ScoringSessionEvent[] = (eventsRes.data ?? []).map((row) => ({
    sequenceNumber: row.sequence_number,
    timestampMs: Number(row.timestamp_ms),
    eventType: row.event_type,
    targetId: row.target_id,
    payload: Array.isArray(row.payload) ? row.payload : [],
  }));

  let evidenceResult;
  try {
    evidenceResult = scoreEvidence(events, groundTruth);
  } catch (err) {
    console.error(`[verify] scoreEvidence threw for session ${sessionId}:`, err);
    return await fail(admin, sessionId, "verification_failed", "Scoring computation failed.");
  }

  const relationshipResult = scoreRelationships(
    (relationshipsRes.data ?? []).map((r) => ({ relationshipId: r.relationship_id, state: r.state, wasEverSelected: r.was_ever_selected })),
    groundTruth,
  );
  const proceduralResult = scoreProcedural(
    (violationsRes.data ?? []).map((v) => ({ eventType: v.event_type })),
    scoringRules.procedural,
  );
  const finalConclusionAccuracy = scoreConclusion(
    { sessionId, scenarioId: session.scenario_id, selectedConclusionId: session.selected_conclusion_id, resolvedEndingId: session.resolved_ending_id },
    groundTruth,
  );

  const categories: ScoreCategories = {
    criticalRecall: evidenceResult.criticalRecall,
    relevantRecall: evidenceResult.relevantRecall,
    precision: evidenceResult.precision,
    distractorFallRate: evidenceResult.distractorFallRate,
    reasoningAccuracy: evidenceResult.reasoningAccuracy,
    documentationAccuracy: evidenceResult.documentationAccuracy,
    relationshipAccuracy: relationshipResult.relationshipAccuracy,
    proceduralCompliance: proceduralResult.proceduralCompliance,
    finalConclusionAccuracy,
  };

  // Scored for every rules version (it's its own category); only counts toward
  // overallScore when the rules give it a weight (1.1.0+).
  const scenePhotoResult = scoreScenePhotography(events, scoringRules.scenePhotography);
  if (scenePhotoResult.scenePhotography !== undefined) {
    categories.scenePhotography = scenePhotoResult.scenePhotography;
    categories.scenePhotographyCoverage = scenePhotoResult.scenePhotographyCoverage;
    categories.scenePhotographySequence = scenePhotoResult.scenePhotographySequence;
    categories.scenePhotographyAccuracy = scenePhotoResult.scenePhotographyAccuracy;
  }

  // Only rules 1.2.0+ carry measurement requirements; earlier versions leave
  // the category undefined, so their sessions score exactly as before.
  const measurementResult = scoreMeasurement(events, scoringRules.measurement);
  if (measurementResult.measurement !== undefined) {
    categories.measurement = measurementResult.measurement;
    categories.measurementCompletion = measurementResult.measurementCompletion;
    categories.measurementAccuracy = measurementResult.measurementAccuracy;
    categories.measurementTiming = measurementResult.measurementTiming;
  }

  // Only rules 1.3.0+ carry a procedureOrder section.
  const procedureOrderResult = scoreProcedureOrder(events, scoringRules.procedureOrder);
  if (procedureOrderResult.procedureOrderCompliance !== undefined) {
    categories.procedureOrderCompliance = procedureOrderResult.procedureOrderCompliance;
    categories.procedureOrderWarningCount = procedureOrderResult.procedureOrderWarningCount;
  }

  const overallScore = computeOverallScore(categories, scoringRules.categoryWeights);
  categories.overallScore = overallScore;

  const warnings = [...evidenceResult.warnings];
  const status: "verified" | "requires_review" = warnings.length > 0 ? "requires_review" : "verified";
  const message = warnings.length > 0 ? warnings.join(" ") : undefined;

  // save_verified_score always writes the categories/overallScore, regardless
  // of status - "requires_review" means "an instructor should look at this,"
  // not "no usable score was produced." status is set via a second, explicit
  // update when it isn't a clean "verified", so the RPC's own always-verified
  // write doesn't need a third status branch.
  const { error: saveError } = await admin.rpc("save_verified_score", {
    p_session_id: sessionId,
    p_scoring_rules_version: scoringRules.scoringRulesVersion,
    p_ground_truth_version: groundTruth.groundTruthVersion,
    p_categories: categories,
    p_overall_score: overallScore ?? null,
    p_verification_message: message ?? null,
  });

  if (saveError) {
    console.error(`[verify] save_verified_score failed for session ${sessionId}:`, saveError.message);
    return await fail(admin, sessionId, "verification_failed", "Unable to save verified score.");
  }

  if (status === "requires_review") {
    const { error: statusError } = await admin.rpc("mark_verification_failed", {
      p_session_id: sessionId,
      p_status: "requires_review",
      p_message: message ?? null,
    });
    if (statusError) {
      console.error(`[verify] mark_verification_failed (requires_review) failed for session ${sessionId}:`, statusError.message);
    }
  }

  return { status, message, categories, overallScore };
}

async function fail(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  sessionId: string,
  status: "verification_failed" | "requires_review",
  message: string,
): Promise<VerifyOutcome> {
  const { error } = await admin.rpc("mark_verification_failed", { p_session_id: sessionId, p_status: status, p_message: message });
  if (error) {
    console.error(`[verify] mark_verification_failed failed for session ${sessionId}:`, error.message);
  }
  return { status, message };
}
