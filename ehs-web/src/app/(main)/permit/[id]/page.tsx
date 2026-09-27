import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getModuleAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { getApproval, getDeptHeads, getPeople, getTemplate } from "@/lib/approval";
import { PERMIT_STATUS, type PermitStatus } from "@/lib/permit";
import { fieldFromRow, permitFromRow } from "@/lib/permit-row";
import { fmtDateTime } from "@/lib/format";
import { Card } from "@/components/ui";
import { ApprovalStatus } from "@/components/approval/ApprovalStatus";
import { PermitEditor } from "../PermitEditor";
import { PermitFieldForm } from "../PermitFieldForm";
import { PermitSummary } from "../PermitSummary";
import { PermitToolbar } from "./PermitToolbar";
import { getJsaOptions } from "../data";

export default async function PermitDetailPage({ params, searchParams }: PageProps<"/permit/[id]">) {
  const { id } = await params;
  const { submitted } = await searchParams;
  const me = await requireProfile();
  const supabase = await createClient();
  const { data: row } = await supabase.from("permits").select("*, departments(name), jsa_evals(id, eval_no)").eq("id", id).maybeSingle();
  if (!row) notFound();

  const approval = await getApproval(supabase, "permit", id);
  const status: PermitStatus =
    row.phase === "completed" ? "completed" : row.phase === "issued" || approval?.status === "approved" ? "issued" : (approval?.status ?? "draft");
  const mod = (await getModuleAccess()).find((m) => m.code === "permit");
  const writer = mod?.level === "write" && me.user_type === "employee";
  const editable = ["draft", "rejected", "withdrawn"].includes(status) && (row.created_by === me.id || me.is_admin);
  const permit = permitFromRow(row);
  const deptName = (row.departments as unknown as { name: string } | null)?.name ?? "";
  const riskEval = row.jsa_evals as unknown as { id: string; eval_no: string } | null;
  const { data: tbm } = await supabase.from("permit_tbm").select("saved_at").eq("permit_id", id).maybeSingle();

  return (
    <div className="space-y-4">
      <Link href="/permit" className="text-sm text-gray-600 hover:underline">
        ← 안전작업허가 현황
      </Link>
      {submitted && status === "in_review" && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">상신했습니다. 최종 승인되면 허가서가 발급되고 메일로 알려 드립니다.</p>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono font-bold text-brand-900">{row.permit_no}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PERMIT_STATUS[status].style}`}>{PERMIT_STATUS[status].label}</span>
        {row.field_saved_at && <span className="text-xs text-gray-500">현장 기록 {fmtDateTime(row.field_saved_at)}</span>}
        <span className="flex-1" />
        <PermitToolbar id={id} status={status} canDelete={editable} canCopy={!!writer} hasTbm={!!tbm} />
      </div>

      {approval && (approval.status !== "withdrawn" || approval.history.length > 0) && (
        <Card title="결재">
          <ApprovalStatus approval={approval} meId={me.id} />
        </Card>
      )}

      {editable ? (
        <PermitEditor
          id={id}
          permitNo={row.permit_no}
          initial={permit}
          departments={await getDeptHeads(supabase)}
          template={await getTemplate(supabase, "permit")}
          people={await getPeople(supabase)}
          meId={me.id}
          jsaOptions={await getJsaOptions(supabase)}
          rejectedNote={status === "rejected" ? approval?.steps.find((s) => s.status === "rejected")?.comment : null}
        />
      ) : (
        <>
          <PermitSummary p={permit} permitNo={row.permit_no} issuedAt={row.issued_at} departmentName={deptName} riskEval={riskEval} />
          {status === "issued" || status === "completed" ? (
            <div id="field" className="scroll-mt-20 space-y-2">
              <h2 className="text-lg font-bold text-brand-950">
                📱 현장 기록 {status === "completed" && <span className="text-sm font-normal text-emerald-700">· 작업완료 {fmtDateTime(row.completed_at)}</span>}
              </h2>
              {status === "issued" && (
                <p className="text-sm text-gray-600">승인된 허가서입니다. 현장에서 안전조치 필요사항을 확인(○)하고, 작업 전·중·후 서명과 가스농도 측정 등을 기록하세요.</p>
              )}
              <PermitFieldForm id={id} permit={permit} initial={fieldFromRow(row)} readOnly={status === "completed" || !writer} />
            </div>
          ) : (
            <Card>
              <p className="py-6 text-center text-sm text-gray-500">결재가 끝나 허가서가 발급되면 현장 기록(○ 확인·서명·가스측정)을 입력할 수 있습니다.</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
