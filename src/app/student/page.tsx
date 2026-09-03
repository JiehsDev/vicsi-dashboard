// src/app/student/page.tsx
import { Clock, AlertTriangle, FileText, CheckCircle2, Gamepad2 } from "lucide-react";
import { Card } from "@/components/Card";
import { StatusPill } from "@/components/StatusPill";
import { CompareBar } from "@/components/CompareBar";
import { KpiCard } from "@/components/KpiCard";
import {
  getMyProfile,
  getStudentSessionSummaries,
  getScenarioAggregate,
  getEvidenceTimeline,
} from "@/lib/supabaseClient";
import { statusOf } from "@/lib/types";
import { EXPERT_BENCHMARK } from "@/lib/constants";

function SummaryRow({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof Clock;
  label: string;
  value: string | number;
  note?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-[13px] text-ink-muted">
        <Icon size={14} /> {label}
      </div>
      <div className="text-right">
        <div className="text-[13.5px] font-semibold text-ink">{value}</div>
        {note && <div className="text-[11px] text-ink-muted">{note}</div>}
      </div>
    </div>
  );
}

export default async function StudentDashboardPage() {
  // Layout already redirects non-students away; this fetch just gets the
  // data this page itself needs (studentId to match sessions against).
  const profile = await getMyProfile();
  const allStudents = await getStudentSessionSummaries();

  const mySession = profile?.studentId
    ? allStudents.find((s) => s.id === profile.studentId)
    : undefined;

  const classAvgAccuracy = allStudents.length
    ? Math.round(
        allStudents.reduce((a, s) => a + s.accuracy, 0) / allStudents.length,
      )
    : 0;
  const classAvgCompliance = allStudents.length
    ? Math.round(
        allStudents.reduce((a, s) => a + s.compliance, 0) /
          allStudents.length,
      )
    : 0;

  if (!mySession) {
    return (
      <div>
        <header className="mb-8">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            My Performance
          </div>
          <h1 className="mt-1 text-[26px] font-bold tracking-tight text-ink">
            {profile?.fullName ?? "Welcome"}
          </h1>
        </header>

        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
            <Gamepad2 size={22} className="text-primary" />
          </div>
          <div className="text-[15px] font-bold text-ink">
            No sessions recorded yet
          </div>
          <p className="max-w-[360px] text-[13.5px] text-ink-muted">
            Play a scenario in the VR headset — sign in there with your
            Student ID and 4-digit PIN — and your results will show up here.
          </p>
        </Card>
      </div>
    );
  }

  const [scenario, timeline] = await Promise.all([
    getScenarioAggregate(mySession.scenarioId),
    getEvidenceTimeline(mySession.sessionId),
  ]);

  return (
    <div>
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            My Performance
          </div>
          <h1 className="mt-1 text-[26px] font-bold tracking-tight text-ink">
            {mySession.name}
          </h1>
          <div className="mt-0.5 font-mono text-[12.5px] text-ink-muted">
            {mySession.id} · {mySession.role}
            {mySession.section ? ` · Section ${mySession.section}` : ""} ·{" "}
            {scenario?.scenarioName ?? mySession.scenarioName}
          </div>
        </div>
        <StatusPill status={statusOf(mySession)} />
      </header>

      <div className="mb-6 flex flex-wrap gap-3.5">
        <KpiCard
          label="Evidence ID Accuracy"
          value={mySession.accuracy}
          suffix="%"
        />
        <KpiCard
          label="Procedural Compliance"
          value={mySession.compliance}
          suffix="%"
        />
        <KpiCard
          label="Scenario Completion"
          value={mySession.completionPct ?? "—"}
          suffix={mySession.completionPct !== undefined ? "%" : ""}
        />
        <KpiCard label="Procedural Errors" value={mySession.errorCount} />
      </div>

      <div className="mb-[22px] grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-muted">
            Benchmark comparison
          </div>
          <div className="mt-[14px]">
            <CompareBar
              label="Deduction accuracy"
              student={mySession.accuracy}
              classAvg={classAvgAccuracy}
              expert={EXPERT_BENCHMARK.accuracy}
            />
            <CompareBar
              label="Procedural compliance"
              student={mySession.compliance}
              classAvg={classAvgCompliance}
              expert={EXPERT_BENCHMARK.compliance}
            />
          </div>
        </Card>

        <Card>
          <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-muted">
            Session summary
          </div>
          <div className="mt-[14px] flex flex-col gap-3">
            <SummaryRow
              icon={Clock}
              label="Time on task"
              value={`${mySession.timeOnTaskMin} min`}
              note={`expert: ${EXPERT_BENCHMARK.timeOnTaskMin} min`}
            />
            <SummaryRow
              icon={AlertTriangle}
              label="Procedural errors"
              value={mySession.errorCount}
              note={mySession.errorCount === 0 ? "clean run" : undefined}
            />
            <SummaryRow
              icon={CheckCircle2}
              label="Scenario completion"
              value={
                mySession.completionPct !== undefined
                  ? `${mySession.completionPct}%`
                  : "—"
              }
            />
            <SummaryRow
              icon={FileText}
              label="Scenario"
              value={scenario?.scenarioName ?? mySession.scenarioName}
            />
          </div>
        </Card>
      </div>

      <Card padded={false} className="overflow-hidden">
        <div className="px-[22px] pb-3 pt-4 text-[11.5px] font-bold uppercase tracking-wide text-ink-muted">
          Action timeline
        </div>
        {timeline.length === 0 ? (
          <div className="px-[22px] py-6 text-[13px] text-ink-muted">
            No detailed timeline recorded for this session yet.
          </div>
        ) : (
          timeline.map((e, i) => (
            <div
              key={i}
              className={`flex gap-3.5 px-[22px] py-3 ${i !== 0 ? "border-t border-border" : ""}`}
            >
              <span className="w-[72px] flex-shrink-0 pt-2 font-mono text-[12px] text-ink-muted">
                {e.timestamp}
              </span>
              <div
                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
                  e.correct ? "bg-good/15" : "bg-critical/15"
                }`}
              >
                {e.correct ? (
                  <CheckCircle2 size={14} className="text-good" />
                ) : (
                  <AlertTriangle size={14} className="text-critical" />
                )}
              </div>
              <div className="pt-1">
                <div className="text-[13.5px] text-ink">
                  <span className="font-semibold">{e.action}</span> —{" "}
                  {e.item}
                </div>
                {e.note && (
                  <div className="mt-0.5 text-[12px] text-critical">
                    {e.note}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
