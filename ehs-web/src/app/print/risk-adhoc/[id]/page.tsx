import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getApproval } from "@/lib/approval";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { JsaPaper } from "@/components/print/JsaPaper";
import { PrintBar } from "../../PrintButton";
import { jsaFromRow } from "@/lib/jsa";
import "../../paper.css";

export default async function JsaPrintPage({ params }: PageProps<"/print/risk-adhoc/[id]">) {
  const { id } = await params;
  if (!(await getProfile())) redirect("/login");
  const supabase = await createClient();
  const { data: row } = await supabase.from("jsa_evals").select("*, departments(name)").eq("id", id).maybeSingle();
  if (!row) notFound();
  const approval = await getApproval(supabase, "risk_adhoc", id);
  const stamps: Record<string, string[]> = {};
  for (const s of approval?.steps ?? []) {
    if (s.status !== "approved") continue;
    (stamps[s.step_kind] ??= []).push(`${s.approver_name ?? ""}\n${fmtDateTime(s.acted_at)}`);
  }
  const status = approval?.status ?? "draft";

  return (
    <div className="paper-screen">
      <PrintBar
        title="작업 위험성평가서 인쇄 미리보기"
        sub={`CF112-01/02 R02 · A4 가로 · 표지(갑) + 상세표(을)${status !== "approved" ? " · ⚠ 결재 완료 전 문서" : ""}`}
      />
      <JsaPaper
        form={jsaFromRow(row)}
        evalNo={row.eval_no}
        evalDate={fmtDate(row.eval_date)}
        departmentName={(row.departments as unknown as { name: string } | null)?.name ?? ""}
        stamps={stamps}
      />
    </div>
  );
}
