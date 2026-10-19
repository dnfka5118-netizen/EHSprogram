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
  const [template, depts, people] = canSubmit ? await Promise.all([getTemplate(supabase, "insp_daily"), getDeptHeads(supabase), getPeople(supabase)]) : [[], [], []];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/insp/daily/logs" className="text-sm text-brand-700 hover:underline">
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
      {canSubmit && (
        <Card title={approval?.status === "rejected" ? "다시 상신" : "상신"}>
          <SubmitLog id={id} initialLine={resolveLine(template, { drafterId: me.id, docDepartmentId: d.area.department_id, depts })} people={people} meId={me.id} />
        </Card>
      )}
    </div>
  );
}
