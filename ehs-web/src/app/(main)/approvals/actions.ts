"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processOutbox } from "@/lib/mail";
import { toMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/types";

async function run(fn: string, args: Record<string, unknown>, message: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { error: toMessage(error) };
  after(() => processOutbox());
  revalidatePath("/", "layout");
  return { ok: true, message };
}

export async function approveStep(approvalId: string, comment: string) {
  return run("approve_step", { p_approval: approvalId, p_comment: comment }, "결재했습니다.");
}

export async function rejectStep(approvalId: string, comment: string) {
  return run("reject_step", { p_approval: approvalId, p_comment: comment }, "반려했습니다.");
}

export async function withdrawApproval(approvalId: string) {
  return run("withdraw_approval", { p_approval: approvalId }, "상신을 취소했습니다.");
}

// 관리자 : 결재자 퇴사 · 장기 부재 시 진행 중 결재의 결재자 변경 (사유 기록, 새 결재자에게 요청 메일)
export async function adminChangeApprover(stepId: string, userId: string, reason: string) {
  return run("admin_change_approver", { p_step: stepId, p_user: userId, p_reason: reason }, "결재자를 바꿨습니다.");
}

// 관리자 : 진행 중 결재 반려 (상신자가 결재선을 고쳐 다시 상신)
export async function adminRejectApproval(approvalId: string, reason: string) {
  return run("admin_reject_approval", { p_approval: approvalId, p_reason: reason }, "관리자 반려했습니다.");
}

// 결재자로 고를 수 있는 임직원 검색 (이름 · 직위)
export async function searchEmployees(q: string): Promise<{ id: string; name: string; position: string | null; dept: string | null }[]> {
  const k = q.trim();
  if (!k) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, name, position, departments!profiles_department_fk(name)")
    .eq("is_active", true)
    .eq("user_type", "employee")
    .ilike("name", `%${k}%`)
    .order("name")
    .limit(20);
  return ((data ?? []) as unknown as { id: string; name: string; position: string | null; departments: { name: string } | null }[]).map((p) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    dept: p.departments?.name ?? null,
  }));
}
