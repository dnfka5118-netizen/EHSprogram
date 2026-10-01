import { createClient } from "@/lib/supabase/server";
import { Card, DeleteSubmit, Input, SubmitButton } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { saveDepartment } from "../actions";
import type { Department, Profile, Site } from "@/lib/types";

const SELECT = "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5";
const COLS = "md:grid-cols-[120px_1fr_130px_60px_1fr_1fr_52px_60px_52px]";

// 조직 : 사업장 › 부문 › 부서 › 파트  (조치 요청·지정자·승인자는 부서 단위, 파트는 소속 표시용)
export default async function DepartmentsPage() {
  const supabase = await createClient();
  const [{ data: sites }, { data: depts }, { data: users }] = await Promise.all([
    supabase.from("sites").select("*").order("sort_order"),
    supabase.from("departments").select("*").order("sort_order"),
    supabase.from("profiles").select("id, name, position, site_id, department_id").eq("is_active", true).order("name"),
  ]);
  const people = (users ?? []) as Pick<Profile, "id" | "name" | "position" | "site_id" | "department_id">[];
  const all = (depts ?? []) as Department[];

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
        조직은 <b>사업장 › 부문 › 부서 › 파트</b> 순입니다. 조치 요청·<b>지정자</b>(조치담당자를 지정하는 사람)·<b>승인자</b>(종결 승인하는 부서장)는{" "}
        <b>부서 단위</b>로 정하고, 파트 소속 직원은 상위 부서 소속으로 봅니다(지정 대상·자진 담당 가능). 파트를 만들려면 <b>상위 부서</b>를 고르세요.
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
                <span>부서 / 파트</span>
                <span>상위 부서 (파트일 때)</span>
                <span>순서</span>
                <span>조치담당자 지정자</span>
                <span>종결 승인자 (부서장)</span>
                <span>사용</span>
                <span />
                <span />
              </div>
              {divisions.map((div) => (
                <div key={div || "-"} className="rounded-md border border-gray-100">
                  <p className="border-b border-gray-100 bg-gray-50 px-2 py-1.5 text-sm font-semibold text-gray-800">{div || "부문 미지정"}</p>
                  {rowsOf(div).map((d) => {
                    const team = d.parent_id ?? d.id;
                    const members = people.filter((p) => p.department_id === team || list.some((x) => x.id === p.department_id && x.parent_id === team));
                    const others = people.filter((p) => p.site_id === site.id && !members.includes(p));
                    const options = (
                      <>
                        <option value="">(미지정)</option>
                        <optgroup label={`${d.name} 소속 (파트 포함)`}>
                          {members.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} {p.position ?? ""}</option>
                          ))}
                        </optgroup>
                        <optgroup label="기타 인원">
                          {others.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} {p.position ?? ""}</option>
                          ))}
                        </optgroup>
                      </>
                    );
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
                          <option value="">(부서)</option>
                          {teams
                            .filter((t) => t.id !== d.id)
                            .map((t) => (
                              <option key={t.id} value={t.id}>{t.name}의 파트</option>
                            ))}
                        </select>
                        <Input name="sort_order" type="number" defaultValue={d.sort_order} />
                        {isPart ? (
                          <span className="col-span-2 text-xs text-gray-500">상위 부서의 지정자·승인자가 맡습니다</span>
                        ) : (
                          <>
                            <select name="assigner_id" defaultValue={d.assigner_id ?? ""} className={SELECT}>
                              {options}
                            </select>
                            <select name="approver_id" defaultValue={d.approver_id ?? ""} className={SELECT}>
                              {options}
                            </select>
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
                <Input name="name" placeholder="새 부서 / 파트 이름" className="max-w-xs" />
                <select name="parent_id" defaultValue="" className={`${SELECT} w-44`}>
                  <option value="">(부서로 추가)</option>
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
