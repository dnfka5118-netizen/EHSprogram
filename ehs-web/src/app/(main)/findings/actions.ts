"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { processOutbox } from "@/lib/mail";
import { createClient } from "@/lib/supabase/server";
import { toMessage } from "@/lib/errors";
import type { ActionState, MeasureKind } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { thumbPathOf } from "@/lib/photo-path";

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
    supabase
      .from("profiles")
      .select("id, name, position, departments!profiles_department_fk!inner(id, parent_id)") // 부서 + 그 아래 파트 소속
      .or(`id.eq.${departmentId},parent_id.eq.${departmentId}`, { referencedTable: "departments" })
      .eq("is_active", true)
      .order("name"),
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

// 사진 회전 저장 : 브라우저에서 돌린 원본·썸네일로 같은 경로를 덮어씀
//   권한 : 관리자 · 등록자 · 조치담당자 · 조치 요청 부서 지정자/승인자 (저장소 쓰기는 확인 후 서비스 키로)
export async function rotatePhoto(fd: FormData): Promise<ActionState> {
  const findingId = String(fd.get("finding_id") ?? "");
  const path = String(fd.get("path") ?? "");
  const main = fd.get("main");
  const thumb = fd.get("thumb");
  if (!(main instanceof Blob) || !(thumb instanceof Blob) || !path.startsWith(`${findingId}/`)) return { error: "잘못된 요청입니다." };
  if (main.size > 3_500_000) return { error: "사진이 너무 큽니다." };

  const me = await getProfile();
  if (!me) return { error: "로그인이 필요합니다." };
  const supabase = await createClient();
  const [{ data: f }, { data: photo }, { data: assignees }] = await Promise.all([
    supabase.from("findings").select("created_by, request_department_id").eq("id", findingId).maybeSingle(),
    supabase.from("finding_photos").select("id").eq("finding_id", findingId).eq("path", path).maybeSingle(),
    supabase.from("finding_assignees").select("user_id").eq("finding_id", findingId),
  ]);
  if (!f || !photo) return { error: "사진을 찾을 수 없습니다." };
  const { data: roles } = await supabase.from("department_roles").select("user_id").eq("department_id", f.request_department_id).eq("user_id", me.id);
  const allowed = me.is_admin || f.created_by === me.id || (assignees ?? []).some((a) => a.user_id === me.id) || (roles ?? []).length > 0;
  if (!allowed) return { error: "사진을 회전할 권한이 없습니다." };

  const admin = createAdminClient();
  for (const [target, blob] of [[path, main], [thumbPathOf(path), thumb]] as const) {
    const { error } = await admin.storage.from("findings").upload(target, blob, { contentType: "image/jpeg", upsert: true, cacheControl: "60" });
    if (error) return { error: toMessage(error) };
  }
  revalidatePath(`/findings/${findingId}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "회전해 저장했습니다." };
}
