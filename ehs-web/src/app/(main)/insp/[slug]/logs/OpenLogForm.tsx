"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import { openDailyLog } from "../../daily-actions";

// 구역 · 월을 골라 일지 열기 (없으면 만듦)
export function OpenLogForm({ areas, month }: { areas: { id: string; name: string; form_code: string }[]; month: string }) {
  const router = useRouter();
  const [area, setArea] = useState(areas[0]?.id ?? "");
  const [ym, setYm] = useState(month);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <Select value={area} onChange={(e) => setArea(e.target.value)} className="w-full sm:w-auto" aria-label="구역">
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.form_code}형)
          </option>
        ))}
      </Select>
      <Input type="month" value={ym} max={month} onChange={(e) => setYm(e.target.value)} className="min-w-0 flex-1 sm:w-40 sm:flex-none" aria-label="월" />
      <Button
        disabled={pending || !area || !ym}
        onClick={() =>
          start(async () => {
            const r = await openDailyLog(area, `${ym}-01`);
            if ("error" in r) return alert(r.error);
            router.push(`/insp/daily/logs/${r.id}`);
          })
        }
      >
        {pending ? "여는 중…" : "일지 열기"}
      </Button>
    </div>
  );
}
