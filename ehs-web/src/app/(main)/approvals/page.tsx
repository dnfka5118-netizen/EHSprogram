import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { APPROVAL_STATUS_LABEL, type Approval } from "@/lib/approval";

type Row = Omit<Approval, "steps" | "history"> & {
  module_name: string;
  doc_path: string;
  drafter_name: string | null;
  department_name: string | null;
  current_approver_name: string | null;
  current_label: string | null;
};

const TABS = [
  { key: "todo", label: "결재 대기" },
  { key: "mine", label: "상신함" },
  { key: "done", label: "결재한 문서" },
] as const;

const STATUS_STYLE: Record<Row["status"], string> = {
  in_review: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-gray-100 text-gray-600",
};

export default async function ApprovalsPage({ searchParams }: PageProps<"/approvals">) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((t) => t.key === tabParam)?.key ?? "todo";
  const me = await requireProfile();
  const supabase = await createClient();

  let rows: Row[] = [];
  if (tab === "todo") {
    const { data } = await supabase.from("approval_overview").select("*").eq("status", "in_review").eq("current_approver_id", me.id).order("submitted_at");
    rows = (data ?? []) as Row[];
  } else if (tab === "mine") {
    const { data } = await supabase.from("approval_overview").select("*").eq("drafter_id", me.id).order("submitted_at", { ascending: false }).limit(200);
    rows = (data ?? []) as Row[];
  } else {
    const { data: acted } = await supabase
      .from("approval_steps")
      .select("approval_id")
      .eq("approver_id", me.id)
      .in("status", ["approved", "rejected"])
      .neq("step_kind", "담당")
      .limit(500);
    const ids = [...new Set((acted ?? []).map((a) => a.approval_id as string))];
    if (ids.length) {
      const { data } = await supabase.from("approval_overview").select("*").in("id", ids.slice(0, 150)).order("submitted_at", { ascending: false });
      rows = (data ?? []) as Row[];
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="전자결재" crumbs={[{ label: "공통" }, { label: "전자결재" }]}>
        <div className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/approvals?tab=${t.key}`}
              className={`shrink-0 border-b-[3px] px-4 py-2.5 text-sm whitespace-nowrap ${
                tab === t.key ? "border-brand-700 font-bold text-brand-800" : "border-transparent text-gray-600 hover:text-brand-800"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </PageHeader>

      <Card>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">{tab === "todo" ? "결재할 문서가 없습니다." : "문서가 없습니다."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="bg-brand-50 text-xs text-gray-700">
                <tr>
                  {["양식", "제목", "해당부서", "상신자", "상신일시", "진행", "상태"].map((h) => (
                    <th key={h} className="border border-gray-200 px-2 py-2 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-brand-50/50">
                    <td className="border border-gray-200 px-2 py-2 whitespace-nowrap text-gray-600">{r.module_name}</td>
                    <td className="border border-gray-200 px-2 py-2">
                      <Link href={r.doc_path} className="font-medium text-brand-800 hover:underline">
                        {r.title}
                      </Link>
                      {r.round > 1 && <span className="ml-1 text-xs text-gray-400">({r.round}차)</span>}
                    </td>
                    <td className="border border-gray-200 px-2 py-2 whitespace-nowrap">{r.department_name ?? "-"}</td>
                    <td className="border border-gray-200 px-2 py-2 whitespace-nowrap">{r.drafter_name ?? "-"}</td>
                    <td className="border border-gray-200 px-2 py-2 whitespace-nowrap text-gray-600">{fmtDateTime(r.submitted_at)}</td>
                    <td className="border border-gray-200 px-2 py-2 whitespace-nowrap text-xs text-gray-600">
                      {r.status === "in_review" ? `${r.current_label} · ${r.current_approver_name ?? "-"}` : fmtDateTime(r.completed_at)}
                    </td>
                    <td className="border border-gray-200 px-2 py-2 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[r.status]}`}>{APPROVAL_STATUS_LABEL[r.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
