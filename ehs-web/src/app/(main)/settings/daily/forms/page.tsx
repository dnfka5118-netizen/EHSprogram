import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Card, DeleteSubmit, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui";
import { saveDailyForm, saveDailyItem } from "../../actions";
import { CYCLE_LABEL, type DailyForm, type DailyFormItem } from "@/lib/daily";

function CycleFields({ item }: { item?: DailyFormItem }) {
  return (
    <>
      <Select name="cycle" defaultValue={item?.cycle ?? "D"} className="w-24" aria-label="점검 주기">
        {Object.entries(CYCLE_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {k} {v}
          </option>
        ))}
      </Select>
      <Input name="cycle_note" defaultValue={item?.cycle_note ?? ""} placeholder="해당 시 등" className="w-28" aria-label="주기 비고" />
    </>
  );
}

// 환경설정 → 일일점검 구역 → 양식 · 점검 항목 (A~D형 항목 · 주기 수정)
export default async function DailyFormsPage({ searchParams }: PageProps<"/settings/daily/forms">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: forms } = await supabase.from("daily_forms").select("*").order("sort_order");
  const list = (forms ?? []) as DailyForm[];
  const cur = list.find((f) => f.code === sp.code) ?? list[0];
  const { data: items } = cur ? await supabase.from("daily_form_items").select("*").eq("form_code", cur.code).order("sort_order") : { data: [] };
  const rows = (items ?? []) as DailyFormItem[];
  const nextOrder = (rows.at(-1)?.sort_order ?? 0) + 10;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/settings/daily" className="text-sm text-brand-700 hover:underline">
          ← 점검 구역
        </Link>
        <span className="flex-1" />
        {list.map((f) => (
          <Link
            key={f.code}
            href={`/settings/daily/forms?code=${f.code}`}
            className={`rounded-full border px-3 py-1 text-sm ${f.code === cur?.code ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 bg-white"}`}
          >
            {f.code}형
          </Link>
        ))}
      </div>

      {cur && (
        <Card title={`${cur.code}형 양식`}>
          <ActionForm action={saveDailyForm} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="code" value={cur.code} />
            <Field label="양식 이름">
              <Input name="name" defaultValue={cur.name} className="w-full" />
            </Field>
            <Field label="양식 번호">
              <Input name="form_no" defaultValue={cur.form_no ?? ""} className="w-full" />
            </Field>
            <Field label="작성자" hint="누가 이 양식을 쓰는지 (안내용)">
              <Input name="writer_note" defaultValue={cur.writer_note ?? ""} className="w-full" />
            </Field>
            <div className="flex items-center gap-3 sm:col-span-3">
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="is_active" defaultChecked={cur.is_active} className="h-4 w-4" /> 사용
              </label>
              <SubmitButton variant="secondary">양식 저장</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      )}

      {cur && (
        <Card title={`점검 항목 (${rows.filter((r) => r.is_active).length}개 사용)`}>
          <p className="mb-3 text-xs break-keep text-gray-500">주기 D = 매일(영업일) · W = 주 1회 · M = 월 1회. 점검 기록이 있는 항목은 지우지 말고 &apos;사용&apos; 을 꺼 주세요.</p>
          <ul className="divide-y divide-gray-100">
            {rows.map((r) => (
              <li key={r.id} className="py-2">
                <ActionForm action={saveDailyItem} className="flex flex-wrap items-start gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <Input name="sort_order" type="number" defaultValue={r.sort_order} className="w-16" aria-label="순서" />
                  <Input name="category" defaultValue={r.category} className="w-32" aria-label="활동 항목" />
                  <Input name="code" defaultValue={r.code} className="w-16" aria-label="항목 구분" />
                  <Textarea name="content" defaultValue={r.content} rows={2} className="min-w-0 flex-1 basis-full sm:basis-72" aria-label="세부 항목" />
                  <CycleFields item={r} />
                  <label className="flex items-center gap-1 pt-1.5 text-sm">
                    <input type="checkbox" name="is_active" defaultChecked={r.is_active} className="h-4 w-4" /> 사용
                  </label>
                  <SubmitButton variant="secondary" className="px-2 py-1">
                    저장
                  </SubmitButton>
                  <DeleteSubmit what={`${r.code} ${r.content.slice(0, 20)}`} />
                </ActionForm>
              </li>
            ))}
          </ul>
          <ActionForm action={saveDailyItem} resetOnSuccess className="mt-3 flex flex-wrap items-start gap-2 border-t border-gray-100 pt-3">
            <input type="hidden" name="form_code" value={cur.code} />
            <Input name="sort_order" type="number" defaultValue={nextOrder} className="w-16" aria-label="순서" />
            <Input name="category" placeholder="활동 항목" className="w-32" />
            <Input name="code" placeholder="1-8" className="w-16" />
            <Textarea name="content" rows={2} placeholder="새 세부 항목" className="min-w-0 flex-1 basis-full sm:basis-72" />
            <CycleFields />
            <SubmitButton>추가</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
