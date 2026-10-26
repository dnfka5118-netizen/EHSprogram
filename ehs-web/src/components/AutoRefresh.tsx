"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// 화면을 열어 두면 정해진 간격으로 최신 내용으로 다시 그림 (실시간 현황판)
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  const [at, setAt] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setAt(new Date());
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  const now = () => {
    router.refresh();
    setAt(new Date());
  };
  return (
    <span className="text-xs text-gray-500">
      {at.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })} 기준 · {seconds}초마다 자동 갱신
      <button type="button" onClick={now} className="ml-2 text-brand-700 underline">
        지금 새로고침
      </button>
    </span>
  );
}
