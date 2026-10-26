import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getApproval } from "@/lib/approval";
import { reviewStamps } from "@/lib/daily-log";
import { getTeamReport, type ReportRow } from "@/lib/daily-report";
import { ymLabel } from "@/lib/daily";
import { todayKst } from "@/lib/format";
import { DailyLogSheet } from "@/components/DailyLogSheet";
import { PrintBar } from "../../PrintButton";
import "../../paper.css";

const B = "border border-gray-500 px-1.5 py-1";
const pct = (v: number | null) => (v === null ? "-" : `${v}%`);
const LABEL: Record<string, string> = { draft: "미제출", submitted: "승인 대기", approved: "승인", rejected: "반려" };
const statusOf = (r: ReportRow) => (r.legacy === "approved" ? "승인" : r.legacy === "in_review" ? "전자결재 중" : LABEL[r.review?.status ?? "draft"]);

// 부서 월간 관리감독자 일일점검 레포트 인쇄 : 1쪽 레포트 + 구역별 일지 (A4 가로)
export default async function DailyReportPrint({ params, searchParams }: PageProps<"/print/daily-report/[team]">) {
  const { team } = await params;
  if (!(await getProfile())) redirect("/login");
  const v = (await searchParams).ym;
  const ym = typeof v === "string" && /^\d{4}-\d{2}$/.test(v) ? v : todayKst().slice(0, 7);
  const supabase = await createClient();
  const report = await getTeamReport(supabase, team, `${ym}-01`);
  if (!report) notFound();
  const approvals = await Promise.all(report.logs.map((d) => (d.id ? getApproval(supabase, "insp_daily", d.id) : null)));
  const t = report.totals;

  return (
    <div className="paper-screen">
      <PrintBar title="부서 관리감독자 일일점검 레포트 인쇄 미리보기" sub={`${report.team.name} · ${ymLabel(report.ym)} · 레포트 1쪽 + 일지 ${report.logs.length}장 · A4 가로`} />
      <style>{`@page { size: A4 landscape; margin: 8mm; } .page-break { break-before: page; }`}</style>
      <div className="mx-auto max-w-[285mm] space-y-4 bg-white p-[6mm] text-[11px] text-gray-900 print:p-0">
        <h1 className="text-base font-bold">
          {ymLabel(report.ym)} {report.team.name} 관리감독자 일일점검 레포트
        </h1>
        <p>
          부서장 {report.heads.join(", ") || "-"} · 제출 마감 {report.deadline.replaceAll("-", ".")}(금) · 출력 {todayKst().replaceAll("-", ".")}
        </p>
        <table className="w-full border-collapse text-center">
          <thead className="bg-gray-100">
            <tr>
              {["구역(양식)", "관리감독자", "제출", "실시율", "제때", "소급", "미점검", "해당월 조치발굴", "당해 조치발굴", "당해 조치완료", "개선조치율", "기한 초과"].map((h) => (
                <th key={h} className={B}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.areaId}>
                <td className={`${B} text-left`}>{r.areaName} ({r.formCode})</td>
                <td className={B}>{r.members.join(", ")}</td>
                <td className={B}>{statusOf(r)}</td>
                <td className={B}>{pct(r.rate)}</td>
                <td className={B}>{r.onTime}</td>
                <td className={B}>{r.backfill}</td>
                <td className={B}>{r.missed}</td>
                <td className={B}>{r.found}</td>
                <td className={B}>{r.foundYear}</td>
                <td className={B}>{r.closedYear}</td>
                <td className={B}>{pct(r.yearRate)}</td>
                <td className={B}>{r.overdue}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-bold">
              <td className={B} colSpan={3}>부서 합계</td>
              <td className={B}>{pct(t.rate)}</td>
              <td className={B}>{t.onTime}</td>
              <td className={B}>{t.backfill}</td>
              <td className={B}>{t.missed}</td>
              <td className={B}>{t.found}</td>
              <td className={B}>{t.foundYear}</td>
              <td className={B}>{t.closedYear}</td>
              <td className={B}>{pct(t.yearRate)}</td>
              <td className={B}>{t.overdue}</td>
            </tr>
          </tbody>
        </table>
        {report.repeats.length > 0 && (
          <div>
            <p className="font-bold">반복 부적합 (같은 항목 3회 이상 X)</p>
            <ul>
              {report.repeats.map((r, i) => (
                <li key={i}>
                  {r.count}회 · {r.area} · {r.code} {r.content}
                </li>
              ))}
            </ul>
          </div>
        )}
        {report.logs.map((d, i) => (
          <div key={d.area.id} className="page-break pt-2">
            <DailyLogSheet d={d} stamps={reviewStamps(d, approvals[i])} />
          </div>
        ))}
      </div>
    </div>
  );
}
