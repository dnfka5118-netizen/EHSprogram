import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getApproval } from "@/lib/approval";
import { fmtDateTime } from "@/lib/format";
import { sopFromRow, sopStamps, SOP_FORM_NO } from "@/lib/sop";
import { SopPaper } from "@/components/print/SopPaper";
import { PrintBar } from "../../PrintButton";
import "../../paper.css";

export default async function SopPrintPage({ params }: PageProps<"/print/sop/[id]">) {
  const { id } = await params;
  if (!(await getProfile())) redirect("/login");
  const supabase = await createClient();
  const { data: row } = await supabase.from("sop_docs").select("*, departments(name)").eq("id", id).maybeSingle();
  if (!row) notFound();
  const form = sopFromRow(row);
  const [approval, { data: jsa }] = await Promise.all([
    getApproval(supabase, "sop", id),
    row.risk_eval_id ? supabase.from("jsa_evals").select("eval_no").eq("id", row.risk_eval_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const stamps = sopStamps(approval, fmtDateTime);

  const paths = form.steps.flatMap((s) => s.photos);
  const photoUrls: Record<string, string> = {};
  if (paths.length) {
    const { data } = await supabase.storage.from("docs").createSignedUrls(paths, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) photoUrls[s.path] = s.signedUrl;
  }

  return (
    <div className="paper-screen">
      <PrintBar
        title="표준운전절차서 인쇄 미리보기"
        sub={`안전운전 절차서 ${SOP_FORM_NO} · A4 가로 · 제개정 이력 + 절차서${approval?.status !== "approved" ? " · ⚠ 결재 완료 전 문서" : ""}`}
      />
      <SopPaper
        f={form}
        rev={row.rev}
        departmentName={(row.departments as unknown as { name: string } | null)?.name ?? ""}
        riskNo={jsa?.eval_no ?? form.risk_no}
        photoUrls={photoUrls}
        stamps={stamps}
      />
    </div>
  );
}
