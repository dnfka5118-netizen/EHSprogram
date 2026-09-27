"use client";

import { useActionState, useState } from "react";
import { createInspection } from "../../actions";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui";
import type { Site } from "@/lib/types";

export function NewInspectionForm({ slug, moduleCode, moduleName, sites, defaultSite, today }: {
  slug: string;
  moduleCode: string;
  moduleName: string;
  sites: Site[];
  defaultSite: string;
  today: string;
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
      <Field label="점검 참여자" hint="예: 대표이사, 공장장, EHS부서장">
        <Input name="inspectors" />
      </Field>
      <Field label="비고">
        <Textarea name="note" rows={2} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton>점검 등록 후 지적사항 입력</SubmitButton>
    </form>
  );
}
