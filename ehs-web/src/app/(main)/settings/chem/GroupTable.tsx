"use client";

import { Fragment, useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { MemberPicker, type Member } from "@/components/MemberPicker";
import { DeleteSubmit, Field, Input, Select, SubmitButton } from "@/components/ui";
import { ScrollX } from "@/components/ScrollX";
import { NameRow, ROWS_GRID } from "../NameRow";
import type { ActionState } from "@/lib/types";
import type { ChemGroup, ChemPlace } from "@/lib/chem";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;
export type GroupRow = ChemGroup & { dept: string; who: string; memberIds: string[]; places: ChemPlace[] };

// 점검 단위 표 : 부서 · 점검 단위 · 점검자 · 점검장소 → [수정] 누르면 그 아래에서 고침 (점검자 · 장소 추가/삭제)
export function GroupTable({
  rows,
  departments,
  people,
  saveGroup,
  savePlace,
}: {
  rows: GroupRow[];
  departments: { id: string; name: string }[];
  people: Member[];
  saveGroup: Action;
  savePlace: Action;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const th = "border-b border-gray-200 px-2 py-2 text-left text-xs font-medium whitespace-nowrap text-gray-500";
  return (
    <ScrollX>
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr>
            <th className={th}>부서</th>
            <th className={th}>점검 단위</th>
            <th className={th}>점검자</th>
            <th className={th}>점검장소</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.id}>
              <tr className={`border-b border-gray-100 align-top ${open === r.id ? "bg-brand-50/60" : "hover:bg-gray-50"} ${r.is_active ? "" : "text-gray-400"}`}>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.dept || "-"}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.name}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.who || <span className="text-red-600">없음</span>}</td>
                <td className="px-2 py-1.5 break-keep">
                  {r.places
                    .filter((p) => p.is_active)
                    .map((p) => p.name)
                    .join(", ") || <span className="text-red-600">없음</span>}
                </td>
                <td className="px-2 py-1 text-right">
                  <button
                    type="button"
                    onClick={() => setOpen(open === r.id ? null : r.id)}
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-xs whitespace-nowrap text-gray-700 hover:bg-gray-50"
                  >
                    {open === r.id ? "닫기" : "✎ 수정"}
                  </button>
                </td>
              </tr>
              {open === r.id && (
                <tr className="border-b border-gray-200 bg-brand-50/30">
                  <td colSpan={5} className="space-y-4 px-3 py-3">
                    <GroupEditor group={r} departments={departments} people={people} action={saveGroup} />
                    <div>
                      <p className="mb-1 text-xs font-medium text-gray-600">점검장소 ({r.places.length})</p>
                      <div className={ROWS_GRID}>
                        {r.places.map((p) => (
                          <NameRow key={p.id} action={savePlace} id={p.id} name={p.name} sortOrder={p.sort_order} isActive={p.is_active} />
                        ))}
                        <NameRow action={savePlace} hidden={{ group_id: r.id }} placeholder="점검장소 추가" />
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </ScrollX>
  );
}

// 점검 단위 : 이름 · 부서(결재 해당 부서 · 재점검 개선 부서) · 점검자(여러 명 가능, 매주 점검 주기 자동)
export function GroupEditor({
  group,
  departments,
  people,
  action,
}: {
  group: GroupRow | null;
  departments: { id: string; name: string }[];
  people: Member[];
  action: Action;
}) {
  const [picked, setPicked] = useState<string[]>(group?.memberIds ?? []);
  const wrapped = async (prev: ActionState, fd: FormData) => {
    const r = await action(prev, fd);
    if (r?.ok && !group) setPicked([]);
    return r;
  };
  return (
    <ActionForm action={wrapped} resetOnSuccess={!group} className="space-y-3">
      {group && <input type="hidden" name="id" value={group.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="점검 단위" required>
          <Input name="name" defaultValue={group?.name} placeholder="예 : 생산팀 (HBC)" />
        </Field>
        <Field label="부서" hint="결재 해당 부서장 · 재점검 개선 부서">
          <Select name="department_id" defaultValue={group?.department_id ?? ""}>
            <option value="">선택</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="순서">
          <Input name="sort_order" type="number" defaultValue={group?.sort_order ?? 0} className="w-24" />
        </Field>
      </div>
      <Field label={`점검자 (${picked.length}명)`} hint="지정하면 점검 지표의 점검 주기 '매주' 에 자동 등록">
        <MemberPicker members={people} picked={picked} onToggle={(id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))} />
      </Field>
      {picked.map((id) => (
        <input key={id} type="hidden" name="member" value={id} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {group && (
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="is_active" defaultChecked={group.is_active} className="h-4 w-4" /> 사용
          </label>
        )}
        <SubmitButton>{group ? "저장" : "점검 단위 추가"}</SubmitButton>
        {group && <DeleteSubmit what={group.name} warning="점검장소도 함께 삭제됩니다." />}
      </div>
    </ActionForm>
  );
}
