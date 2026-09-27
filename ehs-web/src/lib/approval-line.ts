// 양식 기본 결재선 → 실제 결재자 (서버·브라우저 공용, 부서를 바꾸면 화면에서 바로 다시 계산)
export type StepKind = "담당" | "검토" | "협조" | "승인" | "확인";
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

export type LineStep = { step_kind: StepKind; label: string; approver_id: string | null; required: boolean; hint?: string };
export type DeptHead = { id: string; name: string; approver_id: string | null };

export function resolveLine(tpl: TemplateStep[], ctx: { drafterId: string; docDepartmentId: string | null; depts: DeptHead[] }): LineStep[] {
  const dept = (id: string | null) => ctx.depts.find((d) => d.id === id);
  return tpl.map((t) => {
    let approver: string | null = null;
    let hint: string | undefined;
    if (t.resolver === "drafter") approver = ctx.drafterId;
    else if (t.resolver === "user") approver = t.user_id;
    else if (t.resolver === "dept_head") {
      approver = dept(t.department_id)?.approver_id ?? null;
      if (!approver) hint = `${dept(t.department_id)?.name ?? "지정 부서"}의 부서장(승인자)이 환경설정에 없습니다`;
    } else if (t.resolver === "doc_dept_head") {
      approver = dept(ctx.docDepartmentId)?.approver_id ?? null;
      if (!approver) hint = ctx.docDepartmentId ? `${dept(ctx.docDepartmentId)?.name ?? "해당 부서"}의 부서장이 지정되지 않았습니다` : "부서를 먼저 선택하세요";
    } else hint = t.required ? "결재자를 선택하세요" : "필요할 때만 지정 (비워두면 제외)";
    return { step_kind: t.step_kind, label: t.label, approver_id: approver, required: t.required, hint };
  });
}
