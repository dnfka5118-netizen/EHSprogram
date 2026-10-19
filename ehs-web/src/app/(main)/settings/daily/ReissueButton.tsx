"use client";

import { useTransition } from "react";
import { reissueDailyQr } from "../actions";

// QR 재발급 : 이전 QR 은 바로 무효 (사진으로 찍어 가 현장 밖에서 점검하는 것 방지)
export function ReissueButton({ pointId }: { pointId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
      onClick={() => {
        if (!confirm("QR 을 새로 발급할까요?\n지금 현장에 붙어 있는 QR 은 더 이상 열리지 않으니 새로 인쇄해 붙여야 합니다.")) return;
        start(async () => {
          const r = await reissueDailyQr(pointId);
          alert(r?.error ?? r?.message ?? "");
        });
      }}
    >
      {pending ? "발급 중…" : "QR 재발급"}
    </button>
  );
}
