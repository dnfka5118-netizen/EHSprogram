"use client";

import { useState, type ReactNode } from "react";
import { ActionForm } from "@/components/ActionForm";
import { DeleteSubmit, Input, Select, SubmitButton } from "@/components/ui";
import type { ActionState } from "@/lib/types";
import { POINT_GRID, type DailyPoint } from "@/lib/daily";

type Loc = { id: string; name: string; subs: { id: string; name: string }[] };

const SM = "px-2 py-1 text-sm";

// QR 지점 한 줄 : 이름 · 장소 · 세부장소(부적합 지적사항의 장소) · 순서 · 사용 · 저장/삭제 (+ 담당 · 인쇄 · 재발급)
export function PointEditor({ point, locations, action, extra }: { point: DailyPoint | null; locations: Loc[]; action: (prev: ActionState, fd: FormData) => Promise<ActionState>; extra?: ReactNode }) {
  const [loc, setLoc] = useState(point?.location_id ?? "");
  const subs = locations.find((l) => l.id === loc)?.subs ?? [];
  return (
    <ActionForm action={action} resetOnSuccess={!point} className={`${POINT_GRID} py-1.5`}>
      {point && <input type="hidden" name="id" value={point.id} />}
      <Input name="name" defaultValue={point?.name} placeholder="QR 이름 (예 : HBC-C1 제조소)" className={`col-span-2 sm:col-span-1 ${SM}`} />
      <Select name="location_id" value={loc} onChange={(e) => setLoc(e.target.value)} className={SM} aria-label="장소">
        <option value="">장소</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </Select>
      <Select key={loc} name="sub_location_id" defaultValue={point?.location_id === loc ? (point?.sub_location_id ?? "") : ""} className={SM} aria-label="세부장소">
        <option value="">세부장소</option>
        {subs.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <Input name="sort_order" type="number" defaultValue={point?.sort_order ?? 0} className={SM} aria-label="순서" />
      <label className="flex items-center justify-center gap-1 text-xs">
        {point ? <input type="checkbox" name="is_active" defaultChecked={point.is_active} className="h-4 w-4" /> : <span className="text-gray-400">-</span>}
      </label>
      <span className="col-span-2 flex flex-wrap items-center gap-1 sm:col-span-1">
        <SubmitButton variant={point ? "secondary" : "primary"} className="px-2 py-1 text-xs">
          {point ? "저장" : "추가"}
        </SubmitButton>
        {point && <DeleteSubmit what={point.name} />}
        {extra}
      </span>
    </ActionForm>
  );
}
