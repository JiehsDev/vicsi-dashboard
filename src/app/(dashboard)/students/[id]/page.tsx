// src/app/(dashboard)/students/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  AlertTriangle,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/Card";
import { StatusPill } from "@/components/StatusPill";
import { CompareBar } from "@/components/CompareBar";
import {
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

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const allStudents = await getStudentSessionSummaries();
  const student = allStudents.find((s) => s.id === id);

  if (!student) notFound();

  const [scenario, timeline] = await Promise.all([
    getScenarioAggregate(student.scenarioId),
    getEvidenceTimeline(student.sessionId),
  ]);

  const classAvgAccuracy = Math.round(
    allStudents.reduce((a, s) => a + s.accuracy, 0) / allStudents.length,
  );
  const classAvgCompliance = Math.round(
    allStudents.reduce((a, s) => a + s.compliance, 0) / allStudents.length,
  );

  return (
    <div>
      <Link
        href="/"
        className="mb-[18px] inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] text-ink-muted transition-colors hover:bg-surface-tint hover:text-ink"
      >
        <ArrowLeft size={14} /> Back to class overview
      </Link>

      <div className="mb-[22px] flex items-baseline justify-between">
        <div>
          <div className="text-[20px] font-bold text-ink">{student.name}</div>
          <div className="mt-0.5 font-mono text-[12.5px] text-ink-muted">
            {student.id} · {student.role}
            {student.section ? ` · Section ${student.section}` : ""} ·{" "}
            {scenario?.scenarioName ?? student.scenarioName}
          </div>
        </div>
        <StatusPill status={statusOf(student)} />
      </div>

      <div className="mb-[22px] grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-muted">
            Benchmark comparison
          </div>
          <div className="mt-[14px]">
            <CompareBar
              label="Deduction accuracy"
              student={student.accuracy}
              classAvg={classAvgAccuracy}
              expert={EXPERT_BENCHMARK.accuracy}
            />
            <CompareBar
              label="Procedural compliance"
              student={student.compliance}
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
              value={`${student.timeOnTaskMin} min`}
              note={`expert: ${EXPERT_BENCHMARK.timeOnTaskMin} min`}
            />
            <SummaryRow
              icon={AlertTriangle}
              label="Procedural errors"
              value={student.errorCount}
              note={student.errorCount === 0 ? "clean run" : undefined}
            />
            <SummaryRow
              icon={CheckCircle2}
              label="Scenario completion"
              value={
                student.completionPct !== undefined
                  ? `${student.completionPct}%`
                  : "—"
              }
            />
            <SummaryRow
              icon={FileText}
              label="Scenario"
              value={scenario?.scenarioName ?? student.scenarioName}
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
                  <span className="font-semibold">{e.action}</span> — {e.item}
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
