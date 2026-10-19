import { ActionForm } from "@/components/ActionForm";
import { DeleteSubmit, Input, SubmitButton } from "@/components/ui";
import type { ActionState } from "@/lib/types";

// 환경설정 목록 한 줄 : 이름 · 순서 · 사용 · 저장 · 삭제 (장소 · 세부장소 · 유형 공용, 여러 줄을 칸으로 나란히)
export const ROWS_GRID = "grid gap-x-4 sm:grid-cols-2 xl:grid-cols-3";

export function NameRow({
  action,
  id,
  name,
  sortOrder,
  isActive,
  hidden,
  placeholder,
  deleteWarning,
  bold,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  id?: string;
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
  hidden?: Record<string, string>;
  placeholder?: string;
  deleteWarning?: string;
  bold?: boolean;
}) {
  return (
    <ActionForm action={action} resetOnSuccess={!id} className="flex items-center gap-1.5 border-b border-gray-100 py-1">
      {id && <input type="hidden" name="id" value={id} />}
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Input name="name" defaultValue={name} placeholder={placeholder} className={`min-w-0 flex-1 px-2 py-1 text-sm ${bold ? "font-semibold" : ""} ${isActive === false ? "text-gray-400 line-through" : ""}`} />
      <Input name="sort_order" type="number" defaultValue={sortOrder} placeholder="순서" className="w-14 px-1.5 py-1 text-sm" aria-label="순서" />
      {id && (
        <label className="flex shrink-0 items-center gap-0.5 text-xs" title="사용">
          <input type="checkbox" name="is_active" defaultChecked={isActive} className="h-4 w-4" />
          사용
        </label>
      )}
      <SubmitButton variant={id ? "secondary" : "primary"} className="shrink-0 px-2 py-1 text-xs">
        {id ? "저장" : "추가"}
      </SubmitButton>
      {id && <DeleteSubmit what={name ?? ""} warning={deleteWarning} />}
    </ActionForm>
  );
}
