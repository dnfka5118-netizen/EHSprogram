import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getModuleAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { getApproval, getDeptHeads, getPeople, getTemplate } from "@/lib/approval";
import { SOP_STATUS, sopFromRow } from "@/lib/sop";
import { fmtDateTime } from "@/lib/format";
import { Card } from "@/components/ui";
import { ApprovalStatus } from "@/components/approval/ApprovalStatus";
import { getJsaOptions } from "../../permit/data";
import { SopEditor } from "../SopEditor";
import { SopView } from "../SopView";
import { SopToolbar } from "./SopToolbar";

export default async function SopDetailPage({ params, searchParams }: PageProps<"/sop/[id]">) {
  const { id } = await params;
  const { submitted } = await searchParams;
  const me = await requireProfile();
  const supabase = await createClient();
  const { data: row } = await supabase.from("sop_docs").select("*, departments(name), profiles(name)").eq("id", id).maybeSingle();
  if (!row) notFound();

  const [approval, mod, { data: next }, { data: jsa }] = await Promise.all([
    getApproval(supabase, "sop", id),
    getModuleAccess().then((m) => m.find((x) => x.code === "sop")),
    supabase.from("sop_docs").select("id, rev").eq("prev_id", id).maybeSingle(),
    row.risk_eval_id ? supabase.from("jsa_evals").select("eval_no").eq("id", row.risk_eval_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const status = (approval?.status ?? "draft") as keyof typeof SOP_STATUS;
  const editable = (status === "draft" || status === "rejected" || status === "withdrawn") && (row.created_by === me.id || me.is_admin);
  const form = sopFromRow(row);
  const deptName = (row.departments as unknown as { name: string } | null)?.name ?? "";
  const rejectNote = status === "rejected" ? approval?.steps.find((s) => s.status === "rejected")?.comment : null;
  const canRevise = status === "approved" && !next && mod?.level === "write" && me.user_type === "employee";

  // 사진 서명 URL (1시간)
  const paths = form.steps.flatMap((s) => s.photos);
  const photoUrls: Record<string, string> = {};
  if (paths.length) {
    const { data } = await supabase.storage.from("docs").createSignedUrls(paths, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) photoUrls[s.path] = s.signedUrl;
  }

  return (
    <div className="space-y-4">
      <Link href="/sop" className="text-sm text-gray-600 hover:underline">
        ← 표준운전절차서 현황
      </Link>
      {submitted && status === "in_review" && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">상신했습니다. 결재가 끝나면 메일로 알려 드립니다.</p>}
      {next && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          이 절차서는 개정되었습니다 →{" "}
          <Link href={`/sop/${next.id}`} className="font-semibold underline">
            Rev.{next.rev} 보기
          </Link>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono font-bold text-brand-900">{row.sop_no ?? "(표준번호 없음)"}</span>
        <span className="text-gray-600">Rev.{row.rev}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SOP_STATUS[status].style}`}>{SOP_STATUS[status].label}</span>
        <span className="text-gray-500">
          작성 {(row.profiles as unknown as { name: string } | null)?.name ?? "-"} · 수정 {fmtDateTime(row.updated_at)}
        </span>
        <span className="flex-1" />
        <SopToolbar id={id} canDelete={editable} canRevise={canRevise} />
      </div>
      {approval && (approval.status !== "withdrawn" || approval.history.length > 0) && (
        <Card title="결재">
          <ApprovalStatus approval={approval} meId={me.id} isAdmin={me.is_admin} />
        </Card>
      )}
      {editable ? (
        <SopEditor
          id={id}
          rev={row.rev}
          initial={form}
          photoUrls={photoUrls}
          departments={await getDeptHeads(supabase)}
          template={await getTemplate(supabase, "sop", me.id)}
          people={await getPeople(supabase)}
          meId={me.id}
          jsaOptions={await getJsaOptions(supabase)}
          rejectedNote={rejectNote}
        />
      ) : (
        <SopView form={form} departmentName={deptName} riskNo={jsa?.eval_no ?? form.risk_no} photoUrls={photoUrls} />
      )}
    </div>
  );
}
