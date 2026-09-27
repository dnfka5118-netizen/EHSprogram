import { createClient } from "@/lib/supabase/server";
import { Card, DeleteSubmit, Input, SubmitButton } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { saveSite } from "../actions";
import type { Site } from "@/lib/types";

export default async function SitesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("sites").select("*").order("sort_order");

  return (
    <Card title="사업장">
      <p className="mb-3 text-sm text-gray-600">
        사업장을 추가한 뒤 [부서·결재자], [장소] 탭에서 해당 사업장의 부서와 장소를 등록하세요.
      </p>
      <div className="space-y-2">
        <div className="grid grid-cols-[90px_1fr_70px_60px_70px_56px] gap-2 px-1 text-xs text-gray-500">
          <span>코드</span>
          <span>사업장명</span>
          <span>순서</span>
          <span>사용</span>
          <span />
          <span />
        </div>
        {((data ?? []) as Site[]).map((s) => (
          <ActionForm key={s.id} action={saveSite} className="grid grid-cols-[90px_1fr_70px_60px_70px_56px] items-center gap-2">
            <input type="hidden" name="id" value={s.id} />
            <Input name="code" defaultValue={s.code} />
            <Input name="name" defaultValue={s.name} />
            <Input name="sort_order" type="number" defaultValue={s.sort_order} />
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="is_active" defaultChecked={s.is_active} className="h-4 w-4" /> 사용
            </label>
            <SubmitButton variant="secondary" className="px-2 py-1.5">저장</SubmitButton>
            <DeleteSubmit what={s.name} warning="사용하지 않은 부서·장소도 함께 삭제됩니다. 점검 기록이 있으면 삭제되지 않습니다." />
          </ActionForm>
        ))}
        <ActionForm action={saveSite} resetOnSuccess className="grid grid-cols-[90px_1fr_70px_130px] items-center gap-2 border-t border-gray-100 pt-3">
          <Input name="code" placeholder="예: US" />
          <Input name="name" placeholder="예: 울산사업장" />
          <Input name="sort_order" type="number" placeholder="순서" />
          <SubmitButton>사업장 추가</SubmitButton>
        </ActionForm>
      </div>
    </Card>
  );
}
