"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { DeleteSubmit, Input, Select, SubmitButton } from "@/components/ui";
import type { ActionState } from "@/lib/types";
import type { DailyPoint } from "@/lib/daily";

type Loc = { id: string; name: string; subs: { id: string; name: string }[] };

// QR 지점 한 줄 : 이름 · 장소 · 세부장소 (부적합 지적사항의 장소로 들어감)
export function PointEditor({ point, locations, action }: { point: DailyPoint | null; locations: Loc[]; action: (prev: ActionState, fd: FormData) => Promise<ActionState> }) {
  const [loc, setLoc] = useState(point?.location_id ?? "");
  const subs = locations.find((l) => l.id === loc)?.subs ?? [];
  return (
    <ActionForm action={action} resetOnSuccess={!point} className="flex flex-wrap items-center gap-2">
      {point && <input type="hidden" name="id" value={point.id} />}
      <Input name="name" defaultValue={point?.name} placeholder="QR 이름 (예 : HBC-C1 제조소)" className="min-w-0 flex-1 basis-full sm:basis-52" />
      <Select name="location_id" value={loc} onChange={(e) => setLoc(e.target.value)} className="min-w-0 flex-1 sm:w-40 sm:flex-none" aria-label="장소">
        <option value="">장소</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </Select>
      <Select key={loc} name="sub_location_id" defaultValue={point?.location_id === loc ? (point?.sub_location_id ?? "") : ""} className="min-w-0 flex-1 sm:w-40 sm:flex-none" aria-label="세부장소">
        <option value="">세부장소</option>
        {subs.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <Input name="sort_order" type="number" defaultValue={point?.sort_order ?? 0} className="w-16" aria-label="순서" />
      {point && (
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={point.is_active} className="h-4 w-4" /> 사용
        </label>
      )}
      <SubmitButton variant={point ? "secondary" : "primary"} className="px-2 py-1">
        {point ? "저장" : "QR 지점 추가"}
      </SubmitButton>
      {point && <DeleteSubmit what={point.name} />}
    </ActionForm>
  );
}
