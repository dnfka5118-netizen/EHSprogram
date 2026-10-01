"use client";

import { useActionState, useState } from "react";
import { createInspection } from "../../actions";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui";
import type { Site } from "@/lib/types";
import { ParticipantPicker, type Person } from "./ParticipantPicker";

export function NewInspectionForm({ slug, moduleCode, moduleName, sites, defaultSite, today, people, inspector }: {
  slug: string;
  moduleCode: string;
  moduleName: string;
  sites: Site[];
  defaultSite: string;
  today: string;
  people: Person[];
  inspector: string;
}) {
  const [state, action] = useActionState(createInspection, undefined);
  const [date, setDate] = useState(today);
  const [y, m] = date.split("-");
  const autoTitle = y && m ? `${y}년 ${Number(m)}월 ${moduleName}` : moduleName;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="module" value={moduleCode} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="사업장" required>
          <Select name="site" defaultValue={defaultSite} required>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="점검일" required>
          <Input type="date" name="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      </div>
      <Field label="점검명" required>
        <Input name="title" key={autoTitle} defaultValue={autoTitle} required />
      </Field>
      <Field label="점검자" hint="점검 종류에 따라 자동으로 정해집니다">
        <Input value={inspector} readOnly disabled className="bg-gray-100 text-gray-700" />
      </Field>
      <ParticipantPicker people={people} name="inspectors" />
      <Field label="비고">
        <Textarea name="note" rows={2} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>점검 등록 후 지적사항 입력</SubmitButton>
    </form>
  );
}
