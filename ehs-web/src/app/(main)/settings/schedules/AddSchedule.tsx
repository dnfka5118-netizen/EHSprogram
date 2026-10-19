"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { MemberPicker, type Member } from "@/components/MemberPicker";
import { Field, Input, Select, SubmitButton } from "@/components/ui";
import type { ActionState } from "@/lib/types";

// 점검 · 주기 · 점검자(여러 명) 를 골라 한 번에 추가
export function AddSchedule({
  modules,
  people,
  action,
}: {
  modules: { code: string; name: string }[];
  people: Member[];
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const wrapped = async (prev: ActionState, fd: FormData) => {
    const r = await action(prev, fd);
    if (r?.ok) setPicked([]);
    return r;
  };
  return (
    <ActionForm action={wrapped} resetOnSuccess className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="점검" required>
          <Select name="module_code" required className="w-full">
            {modules.map((m) => (
              <option key={m.code} value={m.code}>{m.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="주기" required>
          <Select name="period" defaultValue="weekly" className="w-full">
            <option value="daily">매일 (영업일)</option>
            <option value="weekly">매주</option>
            <option value="monthly">매월</option>
          </Select>
        </Field>
        <Field label="시작일" hint="비우면 오늘부터">
          <Input name="start_date" type="date" className="w-full" />
        </Field>
      </div>
      <Field label={`점검자 (${picked.length}명 선택)`} required>
        <MemberPicker members={people} picked={picked} onToggle={(id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))} />
      </Field>
      {picked.map((id) => (
        <input key={id} type="hidden" name="user_id" value={id} />
      ))}
      <SubmitButton disabled={picked.length === 0}>추가</SubmitButton>
    </ActionForm>
  );
}
