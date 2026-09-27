import { createClient } from "@/lib/supabase/server";
import { Card, Input, SubmitButton } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { saveDepartment } from "../actions";
import type { Department, Profile, Site } from "@/lib/types";

const SELECT = "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5";

export default async function DepartmentsPage() {
  const supabase = await createClient();
  const [{ data: sites }, { data: depts }, { data: users }] = await Promise.all([
    supabase.from("sites").select("*").order("sort_order"),
    supabase.from("departments").select("*").order("sort_order"),
    supabase.from("profiles").select("id, name, position, site_id, department_id").eq("is_active", true).order("name"),
  ]);
  const people = (users ?? []) as Pick<Profile, "id" | "name" | "position" | "site_id" | "department_id">[];

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
        <b>지정자</b>: 조치 요청이 들어오면 부서 내 조치담당자를 지정하는 사람 · <b>승인자(부서장)</b>: 개선 후 사진을 확인하고 종결 승인하는 사람.
        승인자도 담당자 지정이 가능합니다.
      </p>
      {((sites ?? []) as Site[]).map((site) => {
        const list = ((depts ?? []) as Department[]).filter((d) => d.site_id === site.id);
        return (
          <Card key={site.id} title={site.name}>
            <div className="space-y-2">
              <div className="hidden grid-cols-[1fr_70px_1fr_1fr_60px_70px] gap-2 px-1 text-xs text-gray-500 md:grid">
                <span>부서명</span>
                <span>순서</span>
                <span>조치담당자 지정자</span>
                <span>종결 승인자 (부서장)</span>
                <span>사용</span>
                <span />
              </div>
              {list.map((d) => {
                const members = people.filter((p) => p.department_id === d.id);
                const others = people.filter((p) => p.site_id === site.id && p.department_id !== d.id);
                const options = (
                  <>
                    <option value="">(미지정)</option>
                    <optgroup label={`${d.name} 소속`}>
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
                return (
                  <ActionForm
                    key={d.id}
                    action={saveDepartment}
                    className="grid grid-cols-2 items-center gap-2 rounded-md border border-gray-100 p-2 md:grid-cols-[1fr_70px_1fr_1fr_60px_70px] md:border-0 md:p-1"
                  >
                    <input type="hidden" name="id" value={d.id} />
                    <Input name="name" defaultValue={d.name} className="col-span-2 md:col-span-1" />
                    <Input name="sort_order" type="number" defaultValue={d.sort_order} />
                    <select name="assigner_id" defaultValue={d.assigner_id ?? ""} className={`${SELECT} col-span-2 md:col-span-1`}>
                      {options}
                    </select>
                    <select name="approver_id" defaultValue={d.approver_id ?? ""} className={`${SELECT} col-span-2 md:col-span-1`}>
                      {options}
                    </select>
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" name="is_active" defaultChecked={d.is_active} className="h-4 w-4" /> 사용
                    </label>
                    <SubmitButton variant="secondary" className="px-2 py-1.5">저장</SubmitButton>
                  </ActionForm>
                );
              })}
              <ActionForm action={saveDepartment} resetOnSuccess className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                <input type="hidden" name="site_id" value={site.id} />
                <Input name="name" placeholder="새 부서명" className="max-w-xs" />
                <Input name="sort_order" type="number" placeholder="순서" className="w-24" />
                <SubmitButton>부서 추가</SubmitButton>
              </ActionForm>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
