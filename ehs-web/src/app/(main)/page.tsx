import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { FindingList } from "@/components/FindingList";
import type { FindingOverview } from "@/lib/types";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const { pw } = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: myDepts }, { data: myAssigned }] = await Promise.all([
    supabase.from("departments").select("id, assigner_id, approver_id").or(`assigner_id.eq.${profile.id},approver_id.eq.${profile.id}`),
    supabase.from("finding_assignees").select("finding_id").eq("user_id", profile.id),
  ]);

  const assignDeptIds = (myDepts ?? []).map((d) => d.id);
  const approveDeptIds = (myDepts ?? []).filter((d) => d.approver_id === profile.id).map((d) => d.id);
  const assignedIds = (myAssigned ?? []).map((a) => a.finding_id);

  const q = () => supabase.from("finding_overview").select("*").order("created_at", { ascending: false });
  const none = Promise.resolve({ data: [] as FindingOverview[] });

  const [toAssign, toApprove, mine] = await Promise.all([
    assignDeptIds.length ? q().eq("status", "assign_wait").in("request_department_id", assignDeptIds) : none,
    approveDeptIds.length ? q().eq("status", "approval_wait").in("request_department_id", approveDeptIds) : none,
    assignedIds.length ? q().in("status", ["plan_wait", "in_progress"]).in("id", assignedIds) : none,
  ]);

  const mineList = (mine.data ?? []) as FindingOverview[];
  const toPlan = mineList.filter((f) => f.status === "plan_wait");
  const doing = mineList
    .filter((f) => f.status === "in_progress")
    .sort((a, b) => Number(b.is_overdue) - Number(a.is_overdue) || (a.next_due ?? "").localeCompare(b.next_due ?? ""));

  const sections = [
    { title: "조치담당자 지정 필요", desc: "우리 부서로 조치 요청된 지적사항", items: (toAssign.data ?? []) as FindingOverview[] },
    { title: "조치계획 수립 필요", desc: "내가 조치담당자로 지정된 건", items: toPlan },
    { title: "조치 진행 중", desc: "완료 또는 미완료 보고가 필요한 건", items: doing },
    { title: "종결 승인 필요", desc: "개선 후 사진 확인 후 승인/반려", items: (toApprove.data ?? []) as FindingOverview[] },
  ];

  return (
    <div className="space-y-4">
      {pw === "changed" && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">비밀번호가 변경되었습니다.</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {sections.map((s) => (
          <div key={s.title} className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">{s.title}</p>
            <p className={`mt-1 text-2xl font-bold ${s.items.length ? "text-emerald-800" : "text-gray-300"}`}>{s.items.length}</p>
          </div>
        ))}
      </div>
      {sections.map((s) =>
        s.items.length ? (
          <Card key={s.title} title={<>{s.title} <span className="ml-1 text-sm font-normal text-gray-500">{s.desc}</span></>}>
            <FindingList items={s.items} showModule />
          </Card>
        ) : null,
      )}
      {sections.every((s) => s.items.length === 0) && (
        <Card>
          <p className="py-8 text-center text-sm text-gray-500">처리할 일이 없습니다.</p>
        </Card>
      )}
    </div>
  );
}
