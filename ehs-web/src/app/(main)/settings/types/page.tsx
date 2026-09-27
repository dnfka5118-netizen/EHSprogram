import { createClient } from "@/lib/supabase/server";
import { Card, Input, SubmitButton } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { saveType } from "../actions";
import type { FindingType } from "@/lib/types";

export default async function TypesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("finding_types").select("*").order("sort_order");

  return (
    <Card title="지적사항 유형">
      <div className="space-y-2">
        {((data ?? []) as FindingType[]).map((t) => (
          <ActionForm key={t.id} action={saveType} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={t.id} />
            <Input name="name" defaultValue={t.name} className="w-48" />
            <Input name="sort_order" type="number" defaultValue={t.sort_order} className="w-20" />
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="is_active" defaultChecked={t.is_active} className="h-4 w-4" /> 사용
            </label>
            <SubmitButton variant="secondary" className="px-2 py-1">저장</SubmitButton>
          </ActionForm>
        ))}
        <ActionForm action={saveType} resetOnSuccess className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          <Input name="name" placeholder="새 유형" className="w-48" />
          <Input name="sort_order" type="number" placeholder="순서" className="w-20" />
          <SubmitButton>추가</SubmitButton>
        </ActionForm>
      </div>
    </Card>
  );
}
