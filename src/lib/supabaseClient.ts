// src/lib/supabaseClient.ts
import { createSupabaseServerClient } from "./supabaseServer";
import type {
  StudentSessionSummary,
  ScenarioAggregate,
  EvidenceEvent,
  ErrorLogEntry,
  Profile,
} from "./types";

/** Dev-only escape hatch: when set, `getStudentSessionSummaries()` skips the
 *  live query entirely and always returns the mock roster below. The live
 *  `student_session_summary` view currently holds pre-existing placeholder
 *  rows that predate real accounts and have no `section` column (see
 *  BUSINESS_RULES.md §8.2), so a real query succeeding doesn't mean the
 *  mock fallback ever gets exercised. This flag is the only way to actually
 *  see the Class List page grouped by section today. Server-only — do NOT
 *  prefix with NEXT_PUBLIC_. Set `FORCE_MOCK_DATA=1` in `.env.local`. */
const FORCE_MOCK_DATA = process.env.FORCE_MOCK_DATA === "1";

/* ---------------- Mock data (fallback only — used if a query errors) ---------------- */

const MOCK_SCENARIOS: ScenarioAggregate[] = [
  {
    scenarioId: "SCN-001",
    scenarioName: "Residential Burglary — Trace Evidence",
    completionRate: 92,
    avgTimeMin: 15,
    commonError: "Incomplete scene photography",
    errorFrequency: 23,
  },
  {
    scenarioId: "SCN-002",
    scenarioName: "Structure Fire — Origin & Cause",
    completionRate: 74,
    avgTimeMin: 21,
    commonError: "Premature conclusion",
    errorFrequency: 22,
  },
  {
    scenarioId: "SCN-003",
    scenarioName: "Vehicular Fatality — Reconstruction",
    completionRate: 81,
    avgTimeMin: 19,
    commonError: "Sequence violation",
    errorFrequency: 23,
  },
  {
    scenarioId: "SCN-004",
    scenarioName: "Digital Device Seizure — Chain of Custody",
    completionRate: 58,
    avgTimeMin: 24,
    commonError: "Chain-of-custody gap",
    errorFrequency: 22,
  },
  {
    scenarioId: "SCN-005",
    scenarioName: "Homicide — Bloodstain Pattern Analysis",
    completionRate: 66,
    avgTimeMin: 26,
    commonError: "Misidentified trace evidence",
    errorFrequency: 22,
  },
];

const MOCK_SCENARIO = MOCK_SCENARIOS[0];

const MOCK_ERROR_LOG: ErrorLogEntry[] = [
  { label: "Incomplete scene photography", occurrences: 23 },
  { label: "Sequence violation", occurrences: 23 },
  { label: "Premature conclusion", occurrences: 22 },
  { label: "Chain-of-custody gap", occurrences: 22 },
  { label: "Cross-contamination", occurrences: 22 },
  { label: "Misidentified trace evidence", occurrences: 22 },
];

const MOCK_STUDENTS: StudentSessionSummary[] = [
  {
    id: "STU-0231",
    name: "Priya Nakamura",
    role: "Photographer",
    section: "A",
    scenarioId: "SCN-001",
    scenarioName: MOCK_SCENARIO.scenarioName,
    accuracy: 92,
    compliance: 89,
    completionPct: 100,
    timeOnTaskMin: 6,
    errorCount: 1,
    sessionId: "SES-231",
    trendPts: 4,
  },
  {
    id: "STU-0232",
    name: "Devon Marsh",
    role: "IOC",
    section: "A",
    scenarioId: "SCN-001",
    scenarioName: MOCK_SCENARIO.scenarioName,
    accuracy: 74,
    compliance: 68,
    completionPct: 80,
    timeOnTaskMin: 10,
    errorCount: 4,
    sessionId: "SES-232",
    trendPts: -2,
  },
  {
    id: "STU-0233",
    name: "Lucia Ferreira",
    role: "Photographer",
    section: "B",
    scenarioId: "SCN-001",
    scenarioName: MOCK_SCENARIO.scenarioName,
    accuracy: 85,
    compliance: 91,
    completionPct: 100,
    timeOnTaskMin: 7,
    errorCount: 1,
    sessionId: "SES-233",
    trendPts: 1,
  },
  {
    id: "STU-0234",
    name: "Samuel Okoro",
    role: "IOC",
    section: "A",
    scenarioId: "SCN-001",
    scenarioName: MOCK_SCENARIO.scenarioName,
    accuracy: 79,
    compliance: 73,
    completionPct: 60,
    timeOnTaskMin: 12,
    errorCount: 3,
    sessionId: "SES-234",
    trendPts: 6,
  },
  {
    id: "STU-0235",
    name: "Grace Whitfield",
    role: "Photographer",
    section: "B",
    scenarioId: "SCN-001",
    scenarioName: MOCK_SCENARIO.scenarioName,
    accuracy: 96,
    compliance: 94,
    completionPct: 100,
    timeOnTaskMin: 6,
    errorCount: 0,
    sessionId: "SES-235",
    trendPts: 2,
  },
  {
    id: "STU-0236",
    name: "Marcus Bellweather",
    role: "IOC",
    section: "A",
    scenarioId: "SCN-001",
    scenarioName: MOCK_SCENARIO.scenarioName,
    accuracy: 68,
    compliance: 71,
    completionPct: 80,
    timeOnTaskMin: 11,
    errorCount: 5,
    sessionId: "SES-236",
    trendPts: -5,
  },
  {
    id: "STU-0237",
    name: "Anya Volkov",
    role: "Photographer",
    section: "B",
    scenarioId: "SCN-001",
    scenarioName: MOCK_SCENARIO.scenarioName,
    accuracy: 88,
    compliance: 84,
    completionPct: 100,
    timeOnTaskMin: 8,
    errorCount: 2,
    sessionId: "SES-237",
    trendPts: 3,
  },
  {
    id: "STU-0238",
    name: "Tyrell Jackson",
    role: "IOC",
    section: "A",
    scenarioId: "SCN-001",
    scenarioName: MOCK_SCENARIO.scenarioName,
    accuracy: 81,
    compliance: 77,
    completionPct: 80,
    timeOnTaskMin: 9,
    errorCount: 2,
    sessionId: "SES-238",
    trendPts: 0,
  },
  {
    id: "STU-0239",
    name: "Naomi Chen",
    role: "Photographer",
    section: "B",
    scenarioId: "SCN-001",
    scenarioName: MOCK_SCENARIO.scenarioName,
    accuracy: 90,
    compliance: 88,
    completionPct: 100,
    timeOnTaskMin: 7,
    errorCount: 1,
    sessionId: "SES-239",
    trendPts: 5,
  },
  {
    id: "STU-0240",
    name: "Owen Radcliffe",
    role: "IOC",
    section: "A",
    scenarioId: "SCN-001",
    scenarioName: MOCK_SCENARIO.scenarioName,
    accuracy: 71,
    compliance: 65,
    completionPct: 60,
    timeOnTaskMin: 12,
    errorCount: 4,
    sessionId: "SES-240",
    trendPts: -3,
  },
  {
    id: "STU-0241",
    name: "Isabela Cruz",
    role: "Photographer",
    section: "C",
    scenarioId: "SCN-001",
    scenarioName: MOCK_SCENARIO.scenarioName,
    accuracy: 94,
    compliance: 90,
    completionPct: 100,
    timeOnTaskMin: 6,
    errorCount: 1,
    sessionId: "SES-241",
    trendPts: 3,
  },
  {
    id: "STU-0242",
    name: "Kwame Asante",
    role: "IOC",
    section: "C",
    scenarioId: "SCN-001",
    scenarioName: MOCK_SCENARIO.scenarioName,
    accuracy: 76,
    compliance: 72,
    completionPct: 80,
    timeOnTaskMin: 11,
    errorCount: 3,
    sessionId: "SES-242",
    trendPts: 1,
  },
  {
    id: "STU-0243",
    name: "Freya Lindqvist",
    role: "Photographer",
    section: "D",
    scenarioId: "SCN-001",
    scenarioName: MOCK_SCENARIO.scenarioName,
    accuracy: 89,
    compliance: 86,
    completionPct: 100,
    timeOnTaskMin: 7,
    errorCount: 2,
    sessionId: "SES-243",
    trendPts: 2,
  },
  {
    id: "STU-0244",
    name: "Ravi Deshmukh",
    role: "IOC",
    section: "D",
    scenarioId: "SCN-001",
    scenarioName: MOCK_SCENARIO.scenarioName,
    accuracy: 63,
    compliance: 69,
    completionPct: 60,
    timeOnTaskMin: 13,
    errorCount: 6,
    sessionId: "SES-244",
    trendPts: -6,
  },
];

const MOCK_TIMELINE: Record<string, EvidenceEvent[]> = {
  "SES-232": [
    {
      timestamp: "00:02:11",
      action: "Photographed",
      item: "Kitchen knife",
      correct: true,
    },
    {
      timestamp: "00:04:38",
      action: "Connected evidence",
      item: "Knife → Weapon theory",
      correct: true,
    },
    {
      timestamp: "00:07:52",
      action: "Connected evidence",
      item: "Broken glass → Weapon theory",
      correct: false,
      note: "Contradicts blood-spatter direction",
    },
    {
      timestamp: "00:12:05",
      action: "Skipped step",
      item: "Did not review witness statement B",
      correct: false,
    },
    {
      timestamp: "00:18:44",
      action: "Submitted theory",
      item: "Final deduction",
      correct: false,
      note: "Missed a required link",
    },
  ],
};

/* ---------------- Row mappers: snake_case (Postgres) -> camelCase (TS) ---------------- */

function mapStudentRow(row: any): StudentSessionSummary {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    section: row.section ?? undefined,
    scenarioId: row.scenario_id,
    scenarioName: row.scenario_name,
    accuracy: row.accuracy,
    compliance: row.compliance,
    completionPct: row.completion_pct ?? undefined,
    timeOnTaskMin: row.time_on_task_min,
    errorCount: row.error_count,
    sessionId: row.session_id,
    trendPts: row.trend_pts ?? undefined,
  };
}

function mapScenarioRow(row: any): ScenarioAggregate {
  return {
    scenarioId: row.scenario_id,
    scenarioName: row.scenario_name,
    completionRate: row.completion_rate,
    avgTimeMin: row.avg_time_min,
    commonError: row.common_error,
    errorFrequency: row.error_frequency,
  };
}

function mapProfileRow(row: any): Profile {
  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name,
    studentId: row.student_id,
    section: row.section,
  };
}

function mapEvidenceEventRow(row: any): EvidenceEvent {
  return {
    timestamp: row.event_timestamp,
    action: row.action,
    item: row.item,
    correct: row.correct,
    note: row.note ?? undefined,
  };
}

function mapErrorLogRow(row: any): ErrorLogEntry {
  return {
    label: row.label,
    occurrences: row.occurrences,
  };
}

/* ---------------- Public data-access functions ----------------
   All now use the SESSION-AWARE server client, so RLS sees these
   requests as `authenticated` (matching the policies we set up
   earlier) instead of `anon`. Proxy guarantees the caller is signed in
   (instructor OR student) — it does NOT check role. Row-level access
   for the `profiles` table is enforced by RLS (see
   supabase/migrations/001_profiles.sql); `student_session_summary` has
   no such per-row restriction yet, so any authenticated caller can read
   every student's rows via this function today. */

/** The signed-in user's own app-level identity (role, Student ID,
 *  section). No mock fallback — fabricating a fake identity for a real
 *  logged-in user would be actively wrong, not just incomplete. Returns
 *  null if unauthenticated or the profile row doesn't exist. */
export async function getMyProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[supabaseClient] profiles query failed:", error.message);
    return null;
  }

  return data ? mapProfileRow(data) : null;
}

export async function getStudentSessionSummaries(
  scenarioId?: string,
): Promise<StudentSessionSummary[]> {
  if (FORCE_MOCK_DATA) {
    return scenarioId
      ? MOCK_STUDENTS.filter((s) => s.scenarioId === scenarioId)
      : MOCK_STUDENTS;
  }

  const supabase = await createSupabaseServerClient();

  let query = supabase.from("student_session_summary").select("*");
  if (scenarioId) query = query.eq("scenario_id", scenarioId);

  const { data, error } = await query;

  if (error) {
    console.warn(
      "[supabaseClient] student_session_summary query failed, using mock data:",
      error.message,
    );
    return scenarioId
      ? MOCK_STUDENTS.filter((s) => s.scenarioId === scenarioId)
      : MOCK_STUDENTS;
  }

  return (data ?? []).map(mapStudentRow);
}

export async function getScenarioAggregate(
  scenarioId: string,
): Promise<ScenarioAggregate | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("scenario_aggregate")
    .select("*")
    .eq("scenario_id", scenarioId)
    .maybeSingle();

  if (error) {
    console.warn(
      "[supabaseClient] scenario_aggregate query failed, using mock data:",
      error.message,
    );
    return MOCK_SCENARIOS.find((s) => s.scenarioId === scenarioId) ?? null;
  }

  return data ? mapScenarioRow(data) : null;
}

/** All scenarios' aggregates, for the classwide "scenario completion
 *  rates" view and the Scenario Detail page. */
export async function getAllScenarioAggregates(): Promise<
  ScenarioAggregate[]
> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("scenario_aggregate")
    .select("*")
    .order("scenario_name", { ascending: true });

  if (error) {
    console.warn(
      "[supabaseClient] scenario_aggregate (all) query failed, using mock data:",
      error.message,
    );
    return MOCK_SCENARIOS;
  }

  return (data ?? []).map(mapScenarioRow);
}

export async function getEvidenceTimeline(
  sessionId: string,
): Promise<EvidenceEvent[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("evidence_events")
    .select("*")
    .eq("session_id", sessionId)
    .order("sequence", { ascending: true });

  if (error) {
    console.warn(
      "[supabaseClient] evidence_events query failed, using mock data:",
      error.message,
    );
    return MOCK_TIMELINE[sessionId] ?? [];
  }

  return (data ?? []).map(mapEvidenceEventRow);
}

/** Named failure modes aggregated across the whole class, ordered by
 *  frequency. Backs the "Common error log — classwide" view. */
export async function getClassErrorLog(): Promise<ErrorLogEntry[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("class_error_log")
    .select("*")
    .order("occurrences", { ascending: false });

  if (error) {
    console.warn(
      "[supabaseClient] class_error_log query failed, using mock data:",
      error.message,
    );
    return MOCK_ERROR_LOG;
  }

  return (data ?? []).map(mapErrorLogRow);
}
