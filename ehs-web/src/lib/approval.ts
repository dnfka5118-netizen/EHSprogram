import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveLine, type LineStep, type StepKind, type TemplateStep } from "./approval-line";
export type { LineStep, StepKind, TemplateStep, Resolver } from "./approval-line";
export const STEP_KINDS: StepKind[] = ["담당", "검토", "협조", "승인", "확인"];

export type ApprovalStep = {
  id: string;
  round: number;
  step_order: number;
  step_kind: StepKind;
  label: string;
  approver_id: string | null;
  approver_name: string | null;
  approver_position: string | null;
  status: "waiting" | "pending" | "approved" | "rejected" | "skipped";
  comment: string | null;
  acted_at: string | null;
};

export type Approval = {
  id: string;
  module_code: string;
  doc_id: string;
  title: string;
  drafter_id: string | null;
  status: "in_review" | "approved" | "rejected" | "withdrawn";
  round: number;
  submitted_at: string;
  completed_at: string | null;
  cc_ids?: string[]; // 수신참조
  exec_ids?: string[]; // 시행자
  cc_names?: string[];
  exec_names?: string[];
  steps: ApprovalStep[]; // 현재 차수
  history: ApprovalStep[]; // 이전 차수
};

export type Person = { id: string; name: string; position: string | null; department: string | null; department_id: string | null };

export async function getTemplate(supabase: SupabaseClient, moduleCode: string): Promise<TemplateStep[]> {
  const { data } = await supabase.from("approval_template_steps").select("*").eq("module_code", moduleCode).order("step_order");
  return (data ?? []) as TemplateStep[];
}

// 양식 기본 결재선 → 실제 결재자로 풀어서 상신 화면 기본값 만들기
export async function resolveDefaultLine(
  supabase: SupabaseClient,
  moduleCode: string,
  ctx: { drafterId: string; docDepartmentId: string | null },
): Promise<LineStep[]> {
  const [tpl, depts] = await Promise.all([getTemplate(supabase, moduleCode), getDeptHeads(supabase)]);
  return resolveLine(tpl, { ...ctx, depts });
}

export async function getDeptHeads(supabase: SupabaseClient) {
  const { data } = await supabase.from("departments").select("id, name, approver_id").eq("is_active", true).is("parent_id", null).order("sort_order"); // 부서(팀)만
  return (data ?? []) as { id: string; name: string; approver_id: string | null }[];
}

export async function getPeople(supabase: SupabaseClient): Promise<Person[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, name, position, department_id, departments!profiles_department_fk(name)") // 부서 관계가 여러 개라 이름을 지정
    .eq("is_active", true)
    .eq("user_type", "employee")
    .order("name");
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    department: (p.departments as unknown as { name: string } | null)?.name ?? null,
    department_id: p.department_id,
  }));
}

export async function getApproval(supabase: SupabaseClient, moduleCode: string, docId: string): Promise<Approval | null> {
  const { data: ap } = await supabase.from("approvals").select("*").eq("module_code", moduleCode).eq("doc_id", docId).maybeSingle();
  if (!ap) return null;
  const { data: steps } = await supabase
    .from("approval_steps")
    .select("*, profiles(name, position)")
    .eq("approval_id", ap.id)
    .order("round")
    .order("step_order");
  const all = (steps ?? []).map((s) => {
    const p = s.profiles as unknown as { name: string; position: string | null } | null;
    return { ...s, approver_name: p?.name ?? null, approver_position: p?.position ?? null } as ApprovalStep;
  });
  // 수신참조 · 시행자 이름
  const ids = [...(ap.cc_ids ?? []), ...(ap.exec_ids ?? [])];
  const { data: ppl } = ids.length ? await supabase.from("profiles").select("id, name, position").in("id", ids) : { data: [] };
  const nameOf = (id: string) => {
    const p = (ppl ?? []).find((x) => x.id === id);
    return p ? `${p.name}${p.position ? ` ${p.position}` : ""}` : "";
  };
  return {
    ...(ap as Omit<Approval, "steps" | "history">),
    cc_names: (ap.cc_ids ?? []).map(nameOf).filter(Boolean),
    exec_names: (ap.exec_ids ?? []).map(nameOf).filter(Boolean),
    steps: all.filter((s) => s.round === ap.round),
    history: all.filter((s) => s.round < ap.round),
  };
}

export const APPROVAL_STATUS_LABEL: Record<Approval["status"], string> = {
  in_review: "결재 중",
  approved: "결재 완료",
  rejected: "반려",
  withdrawn: "상신 취소",
};
