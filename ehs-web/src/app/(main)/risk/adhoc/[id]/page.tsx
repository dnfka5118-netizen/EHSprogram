import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getApproval, getDeptHeads, getPeople, getTemplate } from "@/lib/approval";
import { jsaFromRow } from "@/lib/jsa";
import { todayKst, fmtDateTime } from "@/lib/format";
import { Card } from "@/components/ui";
import { ApprovalStatus } from "@/components/approval/ApprovalStatus";
import { JsaEditor } from "../JsaEditor";
import { JsaView } from "../JsaView";
import { JsaToolbar } from "./JsaToolbar";
import { JSA_STATUS } from "../status";

export default async function JsaDetailPage({ params, searchParams }: PageProps<"/risk/adhoc/[id]">) {
  const { id } = await params;
  const { submitted } = await searchParams;
  const me = await requireProfile();
  const supabase = await createClient();
  const { data: row } = await supabase.from("jsa_evals").select("*, departments(name), profiles(name)").eq("id", id).maybeSingle();
  if (!row) notFound();

  const [approval, depts] = await Promise.all([getApproval(supabase, "risk_adhoc", id), getDeptHeads(supabase)]);
  const status = (approval?.status ?? "draft") as keyof typeof JSA_STATUS;
  const editable = (status === "draft" || status === "rejected" || status === "withdrawn") && (row.created_by === me.id || me.is_admin);
  const form = jsaFromRow(row);
  const deptName = (row.departments as unknown as { name: string } | null)?.name ?? "";
  const rejectNote = status === "rejected" ? approval?.steps.find((s) => s.status === "rejected")?.comment : null;

  const header = (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-mono font-bold text-brand-900">{row.eval_no}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${JSA_STATUS[status].style}`}>{JSA_STATUS[status].label}</span>
      <span className="text-gray-500">
        작성 {(row.profiles as unknown as { name: string } | null)?.name ?? "-"} · 수정 {fmtDateTime(row.updated_at)}
      </span>
      <span className="flex-1" />
      <JsaToolbar id={id} evalNo={row.eval_no} form={form} departmentName={deptName} canDelete={editable} approval={approval} />
    </div>
  );

  return (
    <div className="space-y-4">
      <Link href="/risk/adhoc" className="text-sm text-gray-600 hover:underline">
        ← 평가서 목록
      </Link>
      {submitted && status === "in_review" && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">상신했습니다. 결재가 끝나면 메일로 알려 드립니다.</p>}
      {header}
      {approval && (approval.status !== "withdrawn" || approval.history.length > 0) && (
        <Card title="결재">
          <ApprovalStatus approval={approval} meId={me.id} />
        </Card>
      )}
      {editable ? (
        <JsaEditor
          id={id}
          evalNo={row.eval_no}
          initial={form}
          departments={depts}
          template={await getTemplate(supabase, "risk_adhoc")}
          people={await getPeople(supabase)}
          meId={me.id}
          today={todayKst()}
          rejectedNote={rejectNote}
        />
      ) : (
        <JsaView form={form} departmentName={deptName} evalNo={row.eval_no} />
      )}
    </div>
  );
}
