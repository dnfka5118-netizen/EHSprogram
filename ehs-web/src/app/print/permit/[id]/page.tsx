import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getApproval } from "@/lib/approval";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { fieldFromRow, permitFromRow } from "@/lib/permit-row";
import { jsaFromRow } from "@/lib/jsa";
import { PermitPaper } from "@/components/print/PermitPaper";
import { JsaPaper } from "@/components/print/JsaPaper";
import { PrintBar } from "../../PrintButton";
import "../../paper.css";

// CF430-01 R04 (A4 가로 2p · 양면 인쇄 시 1p 앞면 / 2p 뒷면) + 연결된 위험성평가 CF112
export default async function PermitPrintPage({ params }: PageProps<"/print/permit/[id]">) {
  const { id } = await params;
  if (!(await getProfile())) redirect("/login");
  const supabase = await createClient();
  const { data: row } = await supabase.from("permits").select("*").eq("id", id).maybeSingle();
  if (!row) notFound();
  const approval = await getApproval(supabase, "permit", id);

  const stamps: Record<"담당" | "검토" | "협조" | "승인", string[]> = { 담당: [], 검토: [], 협조: [], 승인: [] };
  for (const s of approval?.steps ?? []) {
    if (s.status !== "approved") continue;
    const k = (s.step_kind === "확인" ? "협조" : s.step_kind) as keyof typeof stamps;
    stamps[k].push(`${s.approver_name ?? ""}\n${fmtDateTime(s.acted_at)}`);
  }
  const p = permitFromRow(row);

  let jsa = null as null | { form: ReturnType<typeof jsaFromRow>; evalNo: string; evalDate: string; dept: string; stamps: Record<string, string[]> };
  if (row.risk_eval_id && p.checks.docs_risk) {
    const { data: j } = await supabase.from("jsa_evals").select("*, departments(name)").eq("id", row.risk_eval_id).maybeSingle();
    if (j) {
      const ja = await getApproval(supabase, "risk_adhoc", j.id);
      const js: Record<string, string[]> = {};
      for (const s of ja?.steps ?? []) if (s.status === "approved") (js[s.step_kind] ??= []).push(`${s.approver_name ?? ""}\n${fmtDateTime(s.acted_at)}`);
      jsa = { form: jsaFromRow(j), evalNo: j.eval_no, evalDate: fmtDate(j.eval_date), dept: (j.departments as unknown as { name: string } | null)?.name ?? "", stamps: js };
    }
  }

  return (
    <div className="paper-screen">
      <PrintBar
        title="안전작업허가서 인쇄 미리보기"
        sub={`CF430-01 R04 · A4 가로 2p · 양면 인쇄 시 1p 앞면 / 2p 뒷면${jsa ? " · 위험성평가(CF112) 첨부" : ""}${row.phase === "draft" ? " · ⚠ 발급 전 문서" : ""}`}
      />
      <div className="paper-sheets">
        <PermitPaper p={p} f={fieldFromRow(row)} permitNo={row.permit_no} issuedAt={row.issued_at ? fmtDateTime(row.issued_at) : ""} stamps={stamps} />
      </div>
      {jsa && <JsaPaper form={jsa.form} evalNo={jsa.evalNo} evalDate={jsa.evalDate} departmentName={jsa.dept} stamps={jsa.stamps} />}
    </div>
  );
}
