// 양식 기본 결재선 → 실제 결재자 (서버·브라우저 공용, 부서를 바꾸면 화면에서 바로 다시 계산)
export type StepKind = "담당" | "검토" | "협조" | "승인" | "확인" | "참조" | "시행"; // 참조·시행 = 수신참조·시행자 (결재 단계 아님)
export type Resolver =
  | "drafter" | "dept_head" | "doc_dept_head" | "user" | "pick"
  | "drafter_part_head" | "drafter_team_head" | "drafter_division_head" | "doc_division_head"; // 0045 : 조직 (파트장·팀장·부문장)
// 작성자 기준 단계 : 서버(getTemplate)가 작성자 조직으로 미리 풀어 user_id 에 넣어 줌 (없는 단계는 빠짐)
export const DRAFTER_ORG: Partial<Record<Resolver, string>> = { drafter_part_head: "파트장", drafter_team_head: "팀장", drafter_division_head: "부문장" };

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
export type DeptHead = { id: string; name: string; approver_id: string | null; division_head_id?: string | null }; // approver_id = 팀장(없으면 첫 번째 종결 승인자)

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
      if (!approver) hint = ctx.docDepartmentId ? `${dept(ctx.docDepartmentId)?.name ?? "해당 부서"}의 팀장이 지정되지 않았습니다` : "부서를 먼저 선택하세요";
    } else if (t.resolver === "doc_division_head") {
      approver = dept(ctx.docDepartmentId)?.division_head_id ?? null;
      if (!approver) hint = ctx.docDepartmentId ? `${dept(ctx.docDepartmentId)?.name ?? "해당 부서"}의 부문장이 지정되지 않았습니다` : "부서를 먼저 선택하세요";
    } else if (DRAFTER_ORG[t.resolver]) {
      approver = t.user_id;
      if (!approver) hint = `${DRAFTER_ORG[t.resolver]}이 환경설정 → 부서·결재자에 지정되지 않았습니다`;
    } else hint = t.required ? "결재자를 선택하세요" : "필요할 때만 지정 (비워두면 제외)";
    return { step_kind: t.step_kind, label: t.label, approver_id: approver, required: t.required, hint };
  });
}
