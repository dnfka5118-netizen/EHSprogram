import { createClient } from "@/lib/supabase/server";
import { Card, DeleteSubmit, Input, SubmitButton } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { saveDepartment, saveDivisionHead } from "../actions";
import { RolePicker } from "./RolePicker";
import type { Department, Profile, Site } from "@/lib/types";

const SELECT = "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5";
const COLS = "md:grid-cols-[120px_1fr_130px_60px_150px_1fr_1fr_52px_60px_52px]";

type P = { id: string; name: string; position: string | null };
// 장(부문장·팀장·파트장) 고르기 : 소속 직원을 먼저, 그 외 전체
function HeadSelect({ name, value, members, all }: { name: string; value: string | null | undefined; members: P[]; all: P[] }) {
  const label = (p: P) => `${p.name}${p.position ? ` ${p.position}` : ""}`;
  return (
    <select name={name} defaultValue={value ?? ""} className={SELECT}>
      <option value="">(미지정)</option>
      {members.length > 0 && (
        <optgroup label="소속">
          {members.map((p) => (
            <option key={p.id} value={p.id}>{label(p)}</option>
          ))}
        </optgroup>
      )}
      <optgroup label="그 외">
        {all.filter((p) => !members.some((m) => m.id === p.id)).map((p) => (
          <option key={p.id} value={p.id}>{label(p)}</option>
        ))}
      </optgroup>
    </select>
  );
}

// 조직 : 사업장 › 부문 › 팀 › 파트 · 결재선 = 파트장 → 팀장 → 부문장 (0045) · 점검 지정자·종결 승인자는 따로
export default async function DepartmentsPage() {
  const supabase = await createClient();
  const [{ data: sites }, { data: depts }, { data: users }, { data: divHeads }] = await Promise.all([
    supabase.from("sites").select("*").order("sort_order"),
    supabase.from("departments").select("*, department_roles(user_id, role, sort_order)").order("sort_order"),
    supabase.from("profiles").select("id, name, position, site_id, department_id").eq("is_active", true).order("name"),
    supabase.from("division_heads").select("site_id, division, user_id"),
  ]);
  const people = (users ?? []) as Pick<Profile, "id" | "name" | "position" | "site_id" | "department_id">[];
  type Row = Department & { department_roles?: { user_id: string; role: string; sort_order: number }[] };
  const all = (depts ?? []) as Row[];
  const roleIds = (d: Row, role: string) =>
    (d.department_roles ?? []).filter((r) => r.role === role).sort((a, b) => a.sort_order - b.sort_order).map((r) => r.user_id);

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
        조직은 <b>사업장 › 부문 › 팀 › 파트</b> 순입니다. <b>전자결재</b>는 <b>부문장 · 팀장 · 파트장</b>으로 결재선을 채웁니다 (환경설정 → 결재선에서 &quot;작성자의 파트장/팀장/부문장&quot;). 부문장은 부문 제목 줄에서, 팀장·파트장은 각 줄에서 정합니다.{" "}
        <b>점검</b>의 <b>지정자</b>(조치담당자를 지정하는 사람)·<b>종결 승인자</b>는 결재선과 따로이며 <b>여러 명</b> 둘 수 있습니다. 파트 소속 직원은 상위 팀 소속으로 봅니다(지정 대상·자진 담당 가능). 파트를 만들려면 <b>상위 팀</b>을 고르세요. <b>파트 줄의 종결 승인자</b>(파트 리더)는 조치담당자·완료 보고자가 그 파트 소속인 건만 종결 승인합니다. 팀 승인자는 모든 건을 받습니다.
      </p>
      {((sites ?? []) as Site[]).map((site) => {
        const list = all.filter((d) => d.site_id === site.id);
        const teams = list.filter((d) => !d.parent_id);
        const divisions = [...new Set(teams.map((d) => d.division ?? ""))];
        const rowsOf = (div: string) => teams.filter((d) => (d.division ?? "") === div).flatMap((t) => [t, ...list.filter((p) => p.parent_id === t.id)]);
        return (
          <Card key={site.id} title={site.name}>
            <datalist id={`div-${site.id}`}>
              {divisions.filter(Boolean).map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
            <div className="space-y-4">
              <div className={`hidden gap-2 px-1 text-xs text-gray-500 md:grid ${COLS}`}>
                <span>부문</span>
                <span>팀 / 파트</span>
                <span>상위 팀 (파트일 때)</span>
                <span>순서</span>
                <span>팀장 / 파트장 (결재)</span>
                <span>조치담당자 지정자 (여러 명)</span>
                <span>종결 승인자 (여러 명)</span>
                <span>사용</span>
                <span />
                <span />
              </div>
              {divisions.map((div) => (
                <div key={div || "-"} className="rounded-md border border-gray-100">
                  {div ? (
                    <ActionForm action={saveDivisionHead} className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-2 py-1.5">
                      <input type="hidden" name="site_id" value={site.id} />
                      <input type="hidden" name="division" value={div} />
                      <span className="text-sm font-semibold text-gray-800">{div}</span>
                      <span className="text-xs text-gray-500">부문장</span>
                      <div className="w-48">
                        <HeadSelect
                          name="user_id"
                          value={(divHeads ?? []).find((h) => h.site_id === site.id && h.division === div)?.user_id}
                          members={people.filter((p) => list.some((x) => x.id === p.department_id && (x.division ?? "") === div))}
                          all={people}
                        />
                      </div>
                      <SubmitButton variant="secondary" className="px-2 py-1">저장</SubmitButton>
                    </ActionForm>
                  ) : (
                    <p className="border-b border-gray-100 bg-gray-50 px-2 py-1.5 text-sm font-semibold text-gray-800">부문 미지정</p>
                  )}
                  {rowsOf(div).map((d) => {
                    const team = d.parent_id ?? d.id;
                    const members = people.filter((p) => p.department_id === team || list.some((x) => x.id === p.department_id && x.parent_id === team));
                    const others = people.filter((p) => p.site_id === site.id && !members.includes(p));
                    const isPart = !!d.parent_id;
                    return (
                      <ActionForm
                        key={d.id}
                        action={saveDepartment}
                        className={`grid grid-cols-2 items-center gap-2 border-b border-gray-50 p-2 last:border-0 ${COLS} ${isPart ? "bg-gray-50/60" : ""}`}
                      >
                        <input type="hidden" name="id" value={d.id} />
                        {isPart ? (
                          <span className="text-xs text-gray-400">{d.division ?? ""}</span>
                        ) : (
                          <Input name="division" defaultValue={d.division ?? ""} list={`div-${site.id}`} placeholder="부문" />
                        )}
                        <div className="flex items-center gap-1">
                          {isPart && <span className="text-gray-400">└</span>}
                          <Input name="name" defaultValue={d.name} />
                        </div>
                        <select name="parent_id" defaultValue={d.parent_id ?? ""} className={SELECT}>
                          <option value="">(팀)</option>
                          {teams
                            .filter((t) => t.id !== d.id)
                            .map((t) => (
                              <option key={t.id} value={t.id}>{t.name}의 파트</option>
                            ))}
                        </select>
                        <Input name="sort_order" type="number" defaultValue={d.sort_order} />
                        <HeadSelect name="head_id" value={d.head_id} members={isPart ? people.filter((p) => p.department_id === d.id) : members} all={people} />
                        {isPart ? (
                          <>
                            <span className="text-xs text-gray-500">상위 부서의 지정자가 맡습니다</span>
                            <RolePicker
                              name="approver_ids"
                              members={people.filter((p) => p.department_id === d.id)}
                              others={people.filter((p) => p.site_id === site.id && p.department_id !== d.id)}
                              initial={roleIds(d, "approver")}
                              firstHint="파트 리더"
                            />
                          </>
                        ) : (
                          <>
                            <RolePicker name="assigner_ids" members={members} others={others} initial={roleIds(d, "assigner")} />
                            <RolePicker name="approver_ids" members={members} others={others} initial={roleIds(d, "approver")} />
                          </>
                        )}
                        <label className="flex items-center gap-1 text-sm">
                          <input type="checkbox" name="is_active" defaultChecked={d.is_active} className="h-4 w-4" /> 사용
                        </label>
                        <SubmitButton variant="secondary" className="px-2 py-1.5">저장</SubmitButton>
                        <DeleteSubmit what={d.name} warning="소속 사용자는 부서 없음으로 바뀝니다. 지적사항이 있거나 파트가 있는 부서는 삭제되지 않습니다." />
                      </ActionForm>
                    );
                  })}
                </div>
              ))}
              <ActionForm action={saveDepartment} resetOnSuccess className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                <input type="hidden" name="site_id" value={site.id} />
                <Input name="division" list={`div-${site.id}`} placeholder="부문 (예: 천안공장)" className="w-40" />
                <Input name="name" placeholder="새 팀 / 파트 이름" className="max-w-xs" />
                <select name="parent_id" defaultValue="" className={`${SELECT} w-44`}>
                  <option value="">(팀으로 추가)</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}의 파트로 추가</option>
                  ))}
                </select>
                <Input name="sort_order" type="number" placeholder="순서" className="w-24" />
                <SubmitButton>추가</SubmitButton>
              </ActionForm>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
