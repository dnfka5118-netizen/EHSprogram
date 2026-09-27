import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StepKind = "담당" | "검토" | "협조" | "승인" | "확인";
export const STEP_KINDS: StepKind[] = ["담당", "검토", "협조", "승인", "확인"];
export type Resolver = "drafter" | "dept_head" | "doc_dept_head" | "user" | "pick";

export type TemplateStep = {
  id?: string;
  step_order: number;
  step_kind: StepKind;
  label: string;
  resolver: Resolver;
  department_id: string | null;
  user_id: string | null;
  required: boolean;
};

// 상신 화면에서 편집하는 결재선 한 줄
export type LineStep = { step_kind: StepKind; label: string; approver_id: string | null; required: boolean; hint?: string };

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
  steps: ApprovalStep[]; // 현재 차수
  history: ApprovalStep[]; // 이전 차수
};

export type Person = { id: string; name: string; position: string | null; department: string | null };

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
  const tpl = await getTemplate(supabase, moduleCode);
  const deptIds = [...new Set(tpl.map((t) => t.department_id).concat(ctx.docDepartmentId).filter((x): x is string => !!x))];
  const { data: depts } = deptIds.length
    ? await supabase.from("departments").select("id, name, approver_id").in("id", deptIds)
    : { data: [] as { id: string; name: string; approver_id: string | null }[] };
  const head = (id: string | null) => depts?.find((d) => d.id === id);

  return tpl.map((t) => {
    let approver: string | null = null;
    let hint: string | undefined;
    if (t.resolver === "drafter") approver = ctx.drafterId;
    else if (t.resolver === "user") approver = t.user_id;
    else if (t.resolver === "dept_head") {
      approver = head(t.department_id)?.approver_id ?? null;
      if (!approver) hint = `${head(t.department_id)?.name ?? "지정 부서"}의 부서장(승인자)이 환경설정에 없습니다`;
    } else if (t.resolver === "doc_dept_head") {
      approver = head(ctx.docDepartmentId)?.approver_id ?? null;
      if (!approver) hint = ctx.docDepartmentId ? `${head(ctx.docDepartmentId)?.name ?? "해당 부서"}의 부서장이 지정되지 않았습니다` : "해당 부서를 먼저 선택하세요";
    } else hint = t.required ? "결재자를 선택하세요" : "필요할 때만 지정 (비워두면 제외)";
    return { step_kind: t.step_kind, label: t.label, approver_id: approver, required: t.required, hint };
  });
}

export async function getPeople(supabase: SupabaseClient): Promise<Person[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, name, position, departments(name)")
    .eq("is_active", true)
    .eq("user_type", "employee")
    .order("name");
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    department: (p.departments as unknown as { name: string } | null)?.name ?? null,
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
  return { ...(ap as Omit<Approval, "steps" | "history">), steps: all.filter((s) => s.round === ap.round), history: all.filter((s) => s.round < ap.round) };
}

export const APPROVAL_STATUS_LABEL: Record<Approval["status"], string> = {
  in_review: "결재 중",
  approved: "결재 완료",
  rejected: "반려",
  withdrawn: "상신 취소",
};
