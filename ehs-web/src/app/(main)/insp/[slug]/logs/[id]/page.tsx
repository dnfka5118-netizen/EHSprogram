import Link from "next/link";
import { notFound } from "next/navigation";
import { getModuleBySlug } from "@/lib/access";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getApproval, APPROVAL_STATUS_LABEL } from "@/lib/approval";
import { getDailyLog, reviewStamps } from "@/lib/daily-log";
import { getTeamHeads, logDeadline } from "@/lib/daily-report";
import { ymLabel } from "@/lib/daily";
import { Card } from "@/components/ui";
import { fmtDate, todayKst } from "@/lib/format";
import { ApprovalStatus } from "@/components/approval/ApprovalStatus";
import { DailyLogSheet } from "@/components/DailyLogSheet";
import { SubmitLog } from "./SubmitLog";

const REVIEW_LABEL = { draft: "작성 중", submitted: "부서장 승인 대기", approved: "승인 완료", rejected: "반려" } as const;

// 월간 일지 : 원본 양식 모양 + 부서장 제출 (예전 전자결재로 상신된 일지는 결재 현황)
export default async function DailyLogPage({ params }: PageProps<"/insp/[slug]/logs/[id]">) {
  const { slug, id } = await params;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.code !== "insp_daily" || mod.level === "none") notFound();
  const me = await requireProfile();
  const supabase = await createClient();
  const d = await getDailyLog(supabase, id);
  if (!d) notFound();
  const [approval, { data: mem }, { data: team }] = await Promise.all([
    getApproval(supabase, "insp_daily", id),
    supabase.from("daily_area_members").select("user_id").eq("area_id", d.area.id).eq("user_id", me.id),
    supabase.rpc("daily_area_team", { p_area: d.area.id }),
  ]);
  const legacy = !!approval && approval.status !== "withdrawn" && approval.status !== "rejected"; // 예전 방식 결재 진행·완료
  const isMember = me.is_admin || (mem ?? []).length > 0;
  const status = d.review?.status ?? "draft";
  const canEdit = isMember && !legacy && (status === "draft" || status === "rejected"); // 소급 입력 가능
  const missed = d.dayNotes.filter((n) => n.kind === "missed");
  const today = todayKst();
  const lastDay = `${d.ym.slice(0, 8)}${String(d.days).padStart(2, "0")}`;
  const maxBackfill = lastDay < today ? lastDay : new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
  const teamId = (team as string | null) ?? null;
  const heads = teamId ? await getTeamHeads(supabase, teamId) : [];
  const reportHref = teamId ? `/insp/daily/reports/${teamId}?ym=${d.ym.slice(0, 7)}` : "/insp/daily/reports";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/insp/daily?view=mine" className="basis-full text-sm text-brand-700 hover:underline sm:basis-auto">
          ← 나의 점검 현황
        </Link>
        <h2 className="min-w-0 flex-1 text-base font-bold break-keep">
          {ymLabel(d.ym)} · {d.area.name}
        </h2>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{legacy ? APPROVAL_STATUS_LABEL[approval!.status] : REVIEW_LABEL[status]}</span>
        <Link href={`/print/daily-log/${id}`} target="_blank" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
          🖶 인쇄
        </Link>
      </div>

      <Card>
        <p className="mb-2 text-xs text-gray-500 lg:hidden">표가 넓으면 표만 옆으로 밀어서 보세요.</p>
        <DailyLogSheet
          d={d}
          stamps={reviewStamps(d, approval)}
          approvalSlot={
            legacy ? undefined : (
              <SubmitLog
                id={id}
                review={d.review}
                heads={heads}
                canSubmit={isMember}
                canCancel={me.is_admin || d.review?.submitted_by === me.id}
                missed={missed.map((m) => Number(m.date.slice(8)))}
                deadline={logDeadline(d.ym)}
                reportHref={reportHref}
              />
            )
          }
        />
      </Card>

      {approval && (approval.status !== "withdrawn" || approval.history.length > 0) && (
        <Card title="결재 현황 (이전 방식 전자결재)">
          <ApprovalStatus approval={approval} meId={me.id} isAdmin={me.is_admin} />
        </Card>
      )}
      {canEdit && d.ym <= maxBackfill && (
        <Card title="소급 입력 (빠진 날)">
          <p className="mb-2 text-sm break-keep text-gray-600">
            빠진 날의 점검 기록을 채웁니다. 사유가 함께 남고 일지에 &apos;소급&apos; 으로 표시되며, 점검 지표에서는 미진행으로 셉니다. 부서장에게 제출하면 더 이상 소급할 수 없습니다.
          </p>
          {missed.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {missed.map((m) => (
                <Link
                  key={m.date}
                  href={`/insp/daily/logs/${id}/backfill?day=${m.date}`}
                  className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-800 hover:bg-red-100"
                >
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
    </div>
  );
}
