import Link from "next/link";
import { notFound } from "next/navigation";
import { getModuleBySlug } from "@/lib/access";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getApproval, getDeptHeads, getPeople, getTemplate, APPROVAL_STATUS_LABEL } from "@/lib/approval";
import { resolveLine } from "@/lib/approval-line";
import { getDailyLog, logStamps } from "@/lib/daily-log";
import { ymLabel } from "@/lib/daily";
import { Card } from "@/components/ui";
import { fmtDate, todayKst } from "@/lib/format";
import { ScrollX } from "@/components/ScrollX";
import { ApprovalStatus } from "@/components/approval/ApprovalStatus";
import { DailyLogSheet } from "@/components/DailyLogSheet";
import { SubmitLog } from "./SubmitLog";

// 월간 일지 : 원본 양식 모양 + 상신 / 결재 현황
export default async function DailyLogPage({ params }: PageProps<"/insp/[slug]/logs/[id]">) {
  const { slug, id } = await params;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.code !== "insp_daily" || mod.level === "none") notFound();
  const me = await requireProfile();
  const supabase = await createClient();
  const d = await getDailyLog(supabase, id);
  if (!d) notFound();
  const [approval, { data: mem }] = await Promise.all([
    getApproval(supabase, "insp_daily", id),
    supabase.from("daily_area_members").select("user_id").eq("area_id", d.area.id).eq("user_id", me.id),
  ]);
  const canSubmit = (me.is_admin || (mem ?? []).length > 0) && (!approval || approval.status === "rejected" || approval.status === "withdrawn");
  const missed = d.dayNotes.filter((n) => n.kind === "missed");
  const today = todayKst();
  const lastDay = `${d.ym.slice(0, 8)}${String(d.days).padStart(2, "0")}`;
  const maxBackfill = lastDay < today ? lastDay : new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
  const [template, depts, people] = canSubmit ? await Promise.all([getTemplate(supabase, "insp_daily"), getDeptHeads(supabase), getPeople(supabase)]) : [[], [], []];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/insp/daily/logs" className="basis-full text-sm text-brand-700 hover:underline sm:basis-auto">
          ← 월간 일지
        </Link>
        <h2 className="min-w-0 flex-1 text-base font-bold break-keep">
          {ymLabel(d.ym)} · {d.area.name}
        </h2>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{approval ? APPROVAL_STATUS_LABEL[approval.status] : "작성 중"}</span>
        <Link href={`/print/daily-log/${id}`} target="_blank" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
          🖶 인쇄
        </Link>
      </div>

      <Card>
        <p className="mb-2 text-xs text-gray-500 lg:hidden">원본 양식 크기 그대로입니다. 옆으로 밀어서 보세요.</p>
        <ScrollX>
          <div className="min-w-[1000px]">
            <DailyLogSheet d={d} stamps={logStamps(approval)} />
          </div>
        </ScrollX>
      </Card>

      {approval && (approval.status !== "withdrawn" || approval.history.length > 0) && (
        <Card title="결재 현황">
          <ApprovalStatus approval={approval} meId={me.id} />
        </Card>
      )}
      {canSubmit && d.ym <= maxBackfill && (
        <Card title="소급 입력 (빠진 날)">
          <p className="mb-2 text-sm break-keep text-gray-600">
            빠진 날의 점검 기록을 채웁니다. 사유가 함께 남고 일지에 &apos;소급&apos; 으로 표시되며, 점검 지표에서는 미진행으로 셉니다. 상신하면 더 이상 소급할 수 없습니다.
          </p>
          {missed.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {missed.map((m) => (
                <Link key={m.date} href={`/insp/daily/logs/${id}/backfill?day=${m.date}`} className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-800 hover:bg-red-100">
                  {fmtDate(m.date)} 소급 입력
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-emerald-700">빠진 영업일이 없습니다.</p>
          )}
          <form action={`/insp/daily/logs/${id}/backfill`} className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-sm">
            <span className="text-gray-600">다른 날 (휴일 점검 등)</span>
            <input type="date" name="day" required min={d.ym} max={maxBackfill} className="rounded-md border border-gray-300 px-2 py-1.5" />
            <button className="rounded-md border border-gray-300 bg-white px-3 py-1.5 hover:bg-gray-50">소급 입력</button>
          </form>
        </Card>
      )}
      {canSubmit && (
        <Card title={approval?.status === "rejected" ? "다시 상신" : "상신"}>
          {missed.length > 0 && (
            <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm break-keep text-red-800">
              미점검일이 {missed.length}일 있습니다 ({missed.map((m) => Number(m.date.slice(8))).join(", ")}일). 소급 입력 없이 상신하면 일지에 &apos;미점검&apos; 으로 남습니다.
            </p>
          )}
          <SubmitLog id={id} initialLine={resolveLine(template, { drafterId: me.id, docDepartmentId: d.area.department_id, depts })} people={people} meId={me.id} />
        </Card>
      )}
    </div>
  );
}
