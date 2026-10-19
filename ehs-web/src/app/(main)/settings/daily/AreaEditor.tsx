"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { MemberPicker, type Member } from "@/components/MemberPicker";
import { DeleteSubmit, Field, Input, Select, SubmitButton } from "@/components/ui";
import type { ActionState } from "@/lib/types";
import type { DailyArea, DailyForm } from "@/lib/daily";

// 점검 구역 하나 : 이름 · 양식(A~D) · 부서 · 장소 · 담당 관리감독자(여러 명)
export function AreaEditor({
  area,
  memberIds,
  forms,
  departments,
  locations,
  people,
  action,
}: {
  area: DailyArea | null;
  memberIds: string[];
  forms: DailyForm[];
  departments: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  people: Member[];
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const [picked, setPicked] = useState<string[]>(memberIds);
  const wrapped = async (prev: ActionState, fd: FormData) => {
    const r = await action(prev, fd);
    if (r?.ok && !area) setPicked([]);
    return r;
  };
  return (
    <ActionForm action={wrapped} resetOnSuccess={!area} className="space-y-3">
      {area && <input type="hidden" name="id" value={area.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="구역 이름 (My AREA)" required>
          <Input name="name" defaultValue={area?.name} placeholder="예 : HBC-C2 제조실" className="w-full" />
        </Field>
        <Field label="양식" required>
          <Select name="form_code" defaultValue={area?.form_code ?? "A"} className="w-full">
            {forms.map((f) => (
              <option key={f.code} value={f.code}>
                {f.code}형 · {f.writer_note ?? f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="구역 부서" hint="부적합 기본 개선 부서 · 일지 승인 부서장">
          <Select name="department_id" defaultValue={area?.department_id ?? ""} className="w-full">
            <option value="">선택</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="장소" hint="지적사항 현황의 장소">
          <Select name="location_id" defaultValue={area?.location_id ?? ""} className="w-full">
            <option value="">선택</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={`담당 관리감독자 (${picked.length}명)`}>
        <MemberPicker members={people} picked={picked} onToggle={(id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))} />
      </Field>
      {picked.map((id) => (
        <input key={id} type="hidden" name="member" value={id} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Input name="sort_order" type="number" defaultValue={area?.sort_order ?? 0} className="w-20" aria-label="순서" />
        {area && (
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="is_active" defaultChecked={area.is_active} className="h-4 w-4" /> 사용
          </label>
        )}
        <SubmitButton>{area ? "저장" : "구역 추가"}</SubmitButton>
        {area && <DeleteSubmit what={area.name} />}
      </div>
    </ActionForm>
  );
}
