import Link from "next/link";
import { notFound } from "next/navigation";
import { getModuleBySlug } from "@/lib/access";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSubmitBoard, logDeadline } from "@/lib/daily-report";
import { todayKst } from "@/lib/format";
import { Card } from "@/components/ui";
import { ScrollX } from "@/components/ScrollX";
import { MonthNav, readYm } from "./MonthNav";

// 관리감독자 일지 제출 현황판 : 부서별 구역 수 · 승인 대기 · 승인 · 반려 · 미제출 (마감 = 다음 달 첫째 주 금요일)
export default async function DailyReportBoard({ params, searchParams }: PageProps<"/insp/[slug]/reports">) {
  const { slug } = await params;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.code !== "insp_daily" || mod.level === "none") notFound();
  const me = await requireProfile();
  const today = todayKst();
  const ym = readYm((await searchParams).ym, today);
  const supabase = await createClient();
  const rows = await getSubmitBoard(supabase, `${ym}-01`);
  const deadline = logDeadline(`${ym}-01`);
  const late = today > deadline;
  const myTeam = me.department_id ? ((await supabase.from("departments").select("id, parent_id").eq("id", me.department_id).maybeSingle()).data ?? null) : null;
  const mine = myTeam ? ((myTeam.parent_id as string | null) ?? (myTeam.id as string)) : null;
  const sum = (k: "areas" | "submitted" | "approved" | "rejected" | "notSubmitted") => rows.reduce((s, r) => s + r[k], 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <MonthNav ym={ym} max={today.slice(0, 7)} href={(m) => `/insp/daily/reports?ym=${m}`} />
        <span className={`text-sm ${late ? "text-red-700" : "text-gray-600"}`}>
          제출 마감 {deadline.replaceAll("-", ".")}(금){late ? " · 마감 지남" : ""}
        </span>
      </div>
      <Card title="부서별 제출 현황">
        <ScrollX>
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead className="bg-brand-50 text-xs text-gray-700">
              <tr>
                {["부서", "구역", "승인 대기", "승인", "반려", "미제출", ""].map((h, i) => (
                  <th key={i} className="border border-gray-200 px-2 py-2 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.teamId} className={r.teamId === mine ? "bg-brand-50/40" : ""}>
                  <td className="border border-gray-200 px-2 py-2 font-medium">
                    <Link href={`/insp/daily/reports/${r.teamId}?ym=${ym}`} className="text-brand-800 hover:underline">
                      {r.team}
                    </Link>
                    {r.teamId === mine && <span className="ml-1 text-xs text-brand-700">(내 부서)</span>}
                  </td>
                  <td className="border border-gray-200 px-2 py-2 text-center">{r.areas}</td>
                  <td className="border border-gray-200 px-2 py-2 text-center">{r.submitted ? <b className="text-amber-700">{r.submitted}</b> : 0}</td>
                  <td className="border border-gray-200 px-2 py-2 text-center text-emerald-700">{r.approved}</td>
                  <td className="border border-gray-200 px-2 py-2 text-center">{r.rejected ? <span className="text-red-600">{r.rejected}</span> : 0}</td>
                  <td className={`border border-gray-200 px-2 py-2 text-center ${r.notSubmitted && late ? "font-bold text-red-700" : ""}`}>{r.notSubmitted}</td>
                  <td className="border border-gray-200 px-2 py-2 text-center text-xs whitespace-nowrap">
                    {r.approved === r.areas ? (
                      <span className="text-emerald-700">✓ 완료</span>
                    ) : r.notSubmitted && late ? (
                      <span className="text-red-700">마감 초과</span>
                    ) : r.submitted ? (
                      <span className="text-amber-700">부서장 승인 대기</span>
                    ) : (
                      <span className="text-gray-500">제출 중</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="border border-gray-200 py-6 text-center text-gray-500">
                    이 달 관리감독자 구역이 없습니다.
                  </td>
                </tr>
              ) : (
                <tr className="bg-gray-50 font-medium">
                  <td className="border border-gray-200 px-2 py-2">합계</td>
                  <td className="border border-gray-200 px-2 py-2 text-center">{sum("areas")}</td>
                  <td className="border border-gray-200 px-2 py-2 text-center">{sum("submitted")}</td>
                  <td className="border border-gray-200 px-2 py-2 text-center">{sum("approved")}</td>
                  <td className="border border-gray-200 px-2 py-2 text-center">{sum("rejected")}</td>
                  <td className="border border-gray-200 px-2 py-2 text-center">{sum("notSubmitted")}</td>
                  <td className="border border-gray-200 px-2 py-2" />
                </tr>
              )}
            </tbody>
          </table>
        </ScrollX>
        <p className="mt-2 text-xs break-keep text-gray-500">부서를 누르면 그 부서의 월간 레포트(관리감독자별 실시율·조치 현황)를 보고, 부서장은 제출된 일지를 한 번에 승인할 수 있습니다.</p>
      </Card>
    </div>
  );
}
