import Link from "next/link";
import { notFound } from "next/navigation";
import { getModuleBySlug } from "@/lib/access";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { APPROVAL_STATUS_LABEL, getApproval, getDeptHeads, getPeople, getTemplate } from "@/lib/approval";
import { resolveLine } from "@/lib/approval-line";
import { chemStamps, getChemCheck } from "@/lib/chem-check";
import { fmtDate, todayKst } from "@/lib/format";
import { Card } from "@/components/ui";
import { ScrollX } from "@/components/ScrollX";
import { ApprovalStatus } from "@/components/approval/ApprovalStatus";
import { ChemSheet } from "@/components/ChemSheet";
import { ChemForm } from "./ChemForm";
import { ChemSubmit } from "./ChemSubmit";

// 유해화학물질 자체점검대장 한 장 : 작성 · 저장 → 상신 / 결재 뒤에는 보기 · 인쇄
export default async function ChemCheckPage({ params }: PageProps<"/insp/[slug]/checks/[id]">) {
  const { slug, id } = await params;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.code !== "insp_chem" || mod.level === "none") notFound();
  const me = await requireProfile();
  const supabase = await createClient();
  const approval = await getApproval(supabase, "insp_chem", id);
  const locked = approval?.status === "in_review" || approval?.status === "approved";
  const first = await getChemCheck(supabase, id, !locked);
  if (!first) notFound();
  const { data: subRow } = await supabase.from("chem_substitutes").select("user_id").eq("user_id", me.id).maybeSingle();
  const isMember = first.memberIds.includes(me.id);
  const editable = (isMember || me.is_admin || !!subRow) && !locked;
  const d = editable ? first : await getChemCheck(supabase, id, false);
  if (!d) notFound();
  const [template, depts, people] = editable ? await Promise.all([getTemplate(supabase, "insp_chem"), getDeptHeads(supabase), getPeople(supabase)]) : [[], [], []];
  const findings = Object.values(d.notes).filter((n) => n.finding_id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/insp/chem" className="basis-full text-sm text-brand-700 hover:underline sm:basis-auto">
          ← 유해화학물질 자체점검
        </Link>
        <h2 className="min-w-0 flex-1 text-base font-bold break-keep">
          {d.group.name} · {fmtDate(d.week_start)} 주
        </h2>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{approval ? APPROVAL_STATUS_LABEL[approval.status] : d.saved_at ? "저장됨 · 상신 전" : "작성 중"}</span>
        {d.saved_at && (
          <Link href={`/print/chem/${id}`} target="_blank" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
            🖶 인쇄
          </Link>
        )}
      </div>

      {findings.length > 0 && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm break-keep text-red-800">
          정밀 재점검 필요 {findings.length}건이 지적사항(개선 요청)으로 등록되어 있습니다 —{" "}
          {findings.map((f, k) => (
            <Link key={f.finding_id} href={`/findings/${f.finding_id}`} className="underline">
              {k ? ", " : ""}보기
            </Link>
          ))}
        </p>
      )}

      {editable ? (
        <ChemForm d={d} today={todayKst()} substitute={!isMember} />
      ) : (
        <Card>
          <ScrollX>
            <div className="min-w-[760px]">
              <ChemSheet d={d} stamps={chemStamps(approval?.steps)} />
            </div>
          </ScrollX>
        </Card>
      )}

      {approval && (approval.status !== "withdrawn" || approval.history.length > 0) && (
        <Card title="결재 현황">
          <ApprovalStatus approval={approval} meId={me.id} isAdmin={me.is_admin} />
        </Card>
      )}
      {editable && (
        <Card title={approval?.status === "rejected" ? "다시 상신" : "상신 (점검자 → EHS부서장 → 해당 부서장)"}>
          <ChemSubmit
            id={id}
            disabled={!d.saved_at}
            initialLine={resolveLine(template, { drafterId: me.id, docDepartmentId: d.group.department_id, depts })}
            people={people}
            meId={me.id}
          />
        </Card>
      )}
    </div>
  );
}
