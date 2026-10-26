"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { openDailyLog } from "../../daily-actions";

// 이 구역 · 이 달 일지를 열어 상신 화면으로 (없으면 만듦)
export function OpenLogButton({ areaId, ym, label = "일지 열기 · 상신" }: { areaId: string; ym: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      className="px-3 py-1.5 text-xs"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await openDailyLog(areaId, ym);
          if ("error" in r) return alert(r.error);
          router.push(`/insp/daily/logs/${r.id}`);
        })
      }
    >
      {pending ? "여는 중…" : label}
    </Button>
  );
}
