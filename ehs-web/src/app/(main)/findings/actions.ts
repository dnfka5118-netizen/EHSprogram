"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { processOutbox } from "@/lib/mail";
import { createClient } from "@/lib/supabase/server";
import { toMessage } from "@/lib/errors";
import type { ActionState, MeasureKind } from "@/lib/types";

async function run(fn: string, args: Record<string, unknown>, findingId: string, message: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { error: toMessage(error) };
  after(() => processOutbox());
  revalidatePath(`/findings/${findingId}`);
  revalidatePath("/", "layout");
  return { ok: true, message };
}

export async function assignFinding(findingId: string, userIds: string[]) {
  return run("assign_finding", { p_finding: findingId, p_users: userIds }, findingId, "조치담당자가 지정되었습니다.");
}

// 자진 담당 : 조치 요청 부서 직원이 스스로 조치담당자가 됨
export async function selfAssignFinding(findingId: string) {
  return run("self_assign_finding", { p_finding: findingId }, findingId, "조치담당자로 등록되었습니다 (자진 담당).");
}

// 현황표에서 바로 지정할 때 : 조치 요청 부서 구성원 + 현재 담당자
export async function getAssignOptions(findingId: string, departmentId: string) {
  const supabase = await createClient();
  const [{ data: members }, { data: current }] = await Promise.all([
    supabase.from("profiles").select("id, name, position").eq("department_id", departmentId).eq("is_active", true).order("name"),
    supabase.from("finding_assignees").select("user_id").eq("finding_id", findingId),
  ]);
  return {
    members: (members ?? []) as { id: string; name: string; position: string | null }[],
    selected: (current ?? []).map((a) => a.user_id as string),
  };
}

export type PlanInput ={ kind: MeasureKind; content: string; target_date: string }[];

export async function savePlan(findingId: string, measures: PlanInput) {
  return run("save_plan", { p_finding: findingId, p_measures: measures }, findingId, "조치계획이 저장되었습니다.");
}

export type ReportItem = { measure_id: string; done: boolean; new_target_date: string | null };

export async function reportProgress(findingId: string, items: ReportItem[], reason: string, progress: string, afterPhotos: string[]) {
  return run(
    "report_progress",
    { p_finding: findingId, p_items: items, p_reason: reason, p_progress: progress, p_after_photos: afterPhotos },
    findingId,
    "보고되었습니다.",
  );
}

export async function approveFinding(findingId: string, comment: string) {
  return run("approve_finding", { p_finding: findingId, p_comment: comment }, findingId, "종결 승인되었습니다.");
}

// 일괄 승인 : 한 건씩 승인하고 실패한 건만 알려 줌 (권한·상태 검사는 각 건마다 DB 함수가 함)
export async function approveFindings(findingIds: string[]): Promise<ActionState> {
  const supabase = await createClient();
  let done = 0;
  const failed: string[] = [];
  for (const id of findingIds) {
    const { error } = await supabase.rpc("approve_finding", { p_finding: id, p_comment: "일괄 승인" });
    if (error) failed.push(toMessage(error));
    else done++;
  }
  if (done) after(() => processOutbox());
  revalidatePath("/", "layout");
  if (failed.length) return { error: `${done}건 승인, ${failed.length}건 실패 : ${[...new Set(failed)].join(" / ")}` };
  return { ok: true, message: `${done}건을 승인(종결)했습니다.` };
}

export async function rejectFinding(findingId: string, reason: string) {
  return run("reject_finding", { p_finding: findingId, p_reason: reason }, findingId, "반려되었습니다.");
}

export async function addComment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const findingId = String(formData.get("finding"));
  const res = await run(
    "add_comment",
    { p_finding: findingId, p_body: String(formData.get("body") ?? ""), p_directive: formData.get("directive") === "on" },
    findingId,
    "등록되었습니다.",
  );
  return res;
}
