// src/app/(dashboard)/page.tsx
import { Card } from "@/components/Card";
import { KpiCard } from "@/components/KpiCard";
import { BenchmarkBar } from "@/components/BenchmarkBar";
import { ErrorLogCard } from "@/components/ErrorLogCard";
import { ScenarioCompletionCard } from "@/components/ScenarioCompletionCard";
import { StudentTable } from "@/components/StudentTable";
import {
  getStudentSessionSummaries,
  getAllScenarioAggregates,
  getClassErrorLog,
} from "@/lib/supabaseClient";
import { EXPERT_BENCHMARK, CLASS_TREND } from "@/lib/constants";

function formatMinSec(totalMin: number): string {
  const totalSec = Math.round(totalMin * 60);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const [students, scenarios, errorLog] = await Promise.all([
    getStudentSessionSummaries(),
    getAllScenarioAggregates(),
    getClassErrorLog(),
  ]);

  // Filters out undefined before averaging — completionPct isn't backed by
  // a real column yet (see types.ts), so real rows omit it entirely rather
  // than average in as 0 or NaN.
  const avg = (nums: (number | undefined)[]) => {
    const defined = nums.filter((n): n is number => n !== undefined);
    return defined.length
      ? defined.reduce((a, b) => a + b, 0) / defined.length
      : 0;
  };

  const classAvgAccuracy = Math.round(avg(students.map((s) => s.accuracy)));
  const classAvgCompliance = Math.round(avg(students.map((s) => s.compliance)));
  const completionValues = students.map((s) => s.completionPct);
  const hasCompletionData = completionValues.some((v) => v !== undefined);
  const classAvgCompletion = Math.round(avg(completionValues));
  const classAvgResponseMin = avg(students.map((s) => s.timeOnTaskMin));

  const query = q?.toLowerCase().trim();
  const filteredStudents = query
    ? students.filter((s) => s.name.toLowerCase().includes(query))
    : students;

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-3.5">
        <KpiCard
          label="Evidence ID Accuracy"
          value={classAvgAccuracy}
          suffix="%"
          trendText={`+${CLASS_TREND.accuracyPts} pts vs last month`}
          trendDirection="up"
        />
        <KpiCard
          label="Procedural Compliance"
          value={classAvgCompliance}
          suffix="%"
          trendText={`+${CLASS_TREND.compliancePts} pts vs last month`}
          trendDirection="up"
        />
        <KpiCard
          label="Scenario Completion Rate"
          value={hasCompletionData ? classAvgCompletion : "—"}
          suffix={hasCompletionData ? "%" : ""}
          trendText={
            hasCompletionData
              ? `+${CLASS_TREND.completionPts} pts vs last month`
              : undefined
          }
          trendDirection="up"
        />
        <KpiCard
          label="Avg Response Time"
          value={formatMinSec(classAvgResponseMin)}
          trendText={`${formatMinSec(CLASS_TREND.responseTimeFasterMin)} faster vs last month`}
          trendDirection="up"
        />
      </div>

      <Card className="mb-6">
        <div className="mb-4 text-[15px] font-bold text-ink">
          Comparative benchmarking — class average vs. expert
        </div>
        <BenchmarkBar
          label="Evidence ID Accuracy"
          classValue={classAvgAccuracy}
          expertValue={EXPERT_BENCHMARK.accuracy}
        />
        <BenchmarkBar
          label="Procedural Compliance"
          classValue={classAvgCompliance}
          expertValue={EXPERT_BENCHMARK.compliance}
        />
        {hasCompletionData ? (
          <BenchmarkBar
            label="Scenario Completion"
            classValue={classAvgCompletion}
            expertValue={EXPERT_BENCHMARK.completion}
          />
        ) : (
          <div className="text-[13px] text-ink-muted">
            Scenario Completion — no data yet (not tracked by the current
            session view).
          </div>
        )}
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ErrorLogCard entries={errorLog} />
        <ScenarioCompletionCard scenarios={scenarios} />
      </div>

      <div className="mb-3 px-1 text-[15px] font-bold text-ink">
        Student roster
      </div>
      <StudentTable students={filteredStudents} />
    </div>
  );
}
