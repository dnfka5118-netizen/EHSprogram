import Link from "next/link";
import { notFound } from "next/navigation";
import { getModuleBySlug } from "@/lib/access";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTeamReport } from "@/lib/daily-report";
import { ymLabel } from "@/lib/daily";
import { todayKst } from "@/lib/format";
import { Card } from "@/components/ui";
import { MonthNav, readYm } from "../MonthNav";
import { ReportTable } from "./ReportTable";

// 부서 월간 관리감독자 일일점검 레포트 : 관리감독자(구역)별 실시율 · 조치발굴 · 조치완료 · 개선조치율 → 부서장 일괄 승인
export default async function TeamDailyReport({ params, searchParams }: PageProps<"/insp/[slug]/reports/[team]">) {
  const { slug, team } = await params;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.code !== "insp_daily" || mod.level === "none") notFound();
  await requireProfile();
  const today = todayKst();
  const ym = readYm((await searchParams).ym, today);
  const supabase = await createClient();
  const [report, { data: canApprove }] = await Promise.all([getTeamReport(supabase, team, `${ym}-01`), supabase.rpc("is_daily_team_head", { p_team: team })]);
  if (!report) notFound();
  const late = today > report.deadline;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/insp/daily/reports?ym=${ym}`} className="basis-full text-sm text-brand-700 hover:underline sm:basis-auto">
          ← 제출 현황
        </Link>
        <MonthNav ym={ym} max={today.slice(0, 7)} href={(m) => `/insp/daily/reports/${team}?ym=${m}`} />
        <Link href={`/print/daily-report/${team}?ym=${ym}`} target="_blank" className="ml-auto rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
          🖶 인쇄 (레포트 + 일지)
        </Link>
      </div>

      <Card
        title={`${report.team.name} · ${ymLabel(report.ym)} 관리감독자 일일점검 레포트`}
        actions={
          <span className={`text-xs ${late ? "text-red-700" : "text-gray-500"}`}>
            부서장 {report.heads.join(", ") || "미지정"} · 제출 마감 {report.deadline.replaceAll("-", ".")}(금){late ? " (지남)" : ""}
          </span>
        }
      >
        {report.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">이 부서에는 이 달 관리감독자 구역이 없습니다.</p>
        ) : (
          <ReportTable report={{ ...report, logs: [] }} canApprove={!!canApprove} />
        )}
        <p className="mt-2 text-xs break-keep text-gray-500">
          실시율 = 제때 점검한 날 ÷ (제때 + 소급 + 미점검) · 개선조치율 = 올해 조치완료 ÷ 올해 조치발굴 · 기한 초과 = 올해 발굴 중 개선 목표일이 지났는데 완료되지 않은 건
        </p>
      </Card>

      <Card title="반복 부적합 (같은 항목 이 달 3회 이상 X)">
        {report.repeats.length === 0 ? (
          <p className="text-sm text-gray-500">없습니다.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {report.repeats.map((r, i) => (
              <li key={i}>
                <b className="text-red-600">{r.count}회</b> · {r.area} · <span className="text-gray-500">{r.code}</span> {r.content}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
