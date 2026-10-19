import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Card, DeleteSubmit, Input, SubmitButton, Textarea } from "@/components/ui";
import { saveChemGroup, saveChemItem, saveChemPlace, saveChemSubstitutes } from "../actions";
import { SubstituteEditor } from "./SubstituteEditor";
import { GroupEditor, GroupTable, type GroupRow } from "./GroupTable";
import type { ChemGroup, ChemItem, ChemPlace } from "@/lib/chem";

// 환경설정 → 유해화학물질 점검 : 점검 단위(부서별) · 점검자 · 점검장소 · 점검 항목(별지 제42호서식 12개)
export default async function ChemSettingsPage() {
  const supabase = await createClient();
  const [{ data: groups }, { data: members }, { data: places }, { data: items }, { data: depts }, { data: people }, { data: subs }] = await Promise.all([
    supabase.from("chem_groups").select("*").order("sort_order"),
    supabase.from("chem_group_members").select("group_id, user_id, profiles(name)"),
    supabase.from("chem_places").select("*").order("sort_order"),
    supabase.from("chem_items").select("*").order("sort_order"),
    supabase.from("departments").select("id, name").eq("is_active", true).is("parent_id", null).order("sort_order"),
    supabase.from("profiles").select("id, name, position").eq("is_active", true).order("name"),
    supabase.from("chem_substitutes").select("user_id, profiles(name)"),
  ]);
  const subList = (subs ?? []) as unknown as { user_id: string; profiles: { name: string } | null }[];
  const mem = (members ?? []) as unknown as { group_id: string; user_id: string; profiles: { name: string } | null }[];
  const deptName = new Map((depts ?? []).map((d) => [d.id, d.name]));
  const rows: GroupRow[] = ((groups ?? []) as ChemGroup[]).map((g) => ({
    ...g,
    dept: g.department_id ? (deptName.get(g.department_id) ?? "") : "",
    who: mem.filter((m) => m.group_id === g.id).map((m) => m.profiles?.name ?? "").join(", "),
    memberIds: mem.filter((m) => m.group_id === g.id).map((m) => m.user_id),
    places: ((places ?? []) as ChemPlace[]).filter((p) => p.group_id === g.id),
  }));

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-blue-50 px-3 py-2 text-sm break-keep text-blue-900">
        유해화학물질 취급시설 자체점검(주 1회)의 <b>점검 단위 · 점검자 · 점검장소</b>를 정합니다. 점검자는 [유해화학물질 자체점검] 화면에서 이번 주 점검대장을 작성하고, 점검자 → EHS부서장 → 해당 부서장 순으로 결재합니다 (결재선은 &apos;양식별 결재선&apos; 에서 수정).
      </p>
      <Card title={`점검 단위 (${rows.length})`}>
        <GroupTable rows={rows} departments={depts ?? []} people={people ?? []} saveGroup={saveChemGroup} savePlace={saveChemPlace} />
        <details className="mt-3 border-t border-gray-100 pt-3">
          <summary className="cursor-pointer text-sm font-medium text-brand-800">+ 점검 단위 추가</summary>
          <div className="mt-3">
            <GroupEditor group={null} departments={depts ?? []} people={people ?? []} action={saveChemGroup} />
          </div>
        </details>
      </Card>

      <Card title={`대체 점검자 (${subList.length}명 · ${subList.map((x) => x.profiles?.name).join(", ") || "없음"})`}>
        <p className="mb-2 text-xs break-keep text-gray-500">점검자가 휴가·외근 등으로 없을 때 어느 점검 단위든 대신 점검할 수 있는 사람입니다 (EHS부서장 · EHS 유해화학물질 점검원). 대체 점검은 사유를 남기고, 점검대장에 &apos;대체 점검&apos; 으로 표시됩니다.</p>
        <details>
          <summary className="cursor-pointer text-sm text-brand-800">명단 바꾸기</summary>
          <div className="mt-2">
            <SubstituteEditor people={people ?? []} ids={subList.map((x) => x.user_id)} action={saveChemSubstitutes} />
          </div>
        </details>
      </Card>

      <Card title="점검 항목 (화학물질관리법 시행규칙 별지 제42호서식)">
        <ul className="divide-y divide-gray-100">
          {((items ?? []) as ChemItem[]).map((i) => (
            <li key={i.id}>
              <ActionForm action={saveChemItem} className="flex flex-wrap items-start gap-1.5 py-1.5 sm:flex-nowrap">
                <input type="hidden" name="id" value={i.id} />
                <Input name="code" defaultValue={i.code} className="w-12 px-1.5 py-1 text-center text-sm" aria-label="번호" />
                <Textarea name="content" defaultValue={i.content} rows={1} className={`min-w-0 flex-1 basis-60 px-2 py-1 text-sm ${i.is_active ? "" : "text-gray-400 line-through"}`} />
                <Input name="sort_order" type="number" defaultValue={i.sort_order} className="w-14 px-1.5 py-1 text-sm" aria-label="순서" />
                <label className="flex shrink-0 items-center gap-0.5 pt-1.5 text-xs">
                  <input type="checkbox" name="is_active" defaultChecked={i.is_active} className="h-4 w-4" />
                  사용
                </label>
                <SubmitButton variant="secondary" className="shrink-0 px-2 py-1 text-xs">
                  저장
                </SubmitButton>
                <DeleteSubmit what={`${i.code} 항목`} />
              </ActionForm>
            </li>
          ))}
        </ul>
        <ActionForm action={saveChemItem} resetOnSuccess className="mt-2 flex flex-wrap items-start gap-1.5 border-t border-gray-100 pt-2 sm:flex-nowrap">
          <Input name="code" placeholder="⑬" className="w-12 px-1.5 py-1 text-center text-sm" />
          <Textarea name="content" rows={1} placeholder="새 점검 항목" className="min-w-0 flex-1 basis-60 px-2 py-1 text-sm" />
          <Input name="sort_order" type="number" placeholder="순서" className="w-14 px-1.5 py-1 text-sm" />
          <SubmitButton className="shrink-0 px-2 py-1 text-xs">추가</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
