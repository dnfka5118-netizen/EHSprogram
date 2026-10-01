"use client";

import { useState } from "react";

const SELECT = "rounded-md border border-gray-300 bg-white px-2 py-1.5";
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 시행 일자 (시작 ~ 끝) + 빠른 선택 : 이번 달 · 지난달 · 올해
export function DateRange({ from, to }: { from: string; to: string }) {
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  const preset = (kind: "this" | "last" | "year") => {
    const now = new Date();
    if (kind === "year") {
      setA(`${now.getFullYear()}-01-01`);
      setB(`${now.getFullYear()}-12-31`);
      return;
    }
    const first = new Date(now.getFullYear(), now.getMonth() - (kind === "last" ? 1 : 0), 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    setA(ymd(first));
    setB(ymd(last));
  };
  return (
    <div className="col-span-2 flex flex-wrap items-center gap-1 md:col-span-1">
      <span className="text-xs text-gray-500">시행 일자</span>
      <input type="date" name="from" value={a} max={b || undefined} onChange={(e) => setA(e.target.value)} className={SELECT} aria-label="시행 일자 시작" />
      <span className="text-gray-400">~</span>
      <input type="date" name="to" value={b} min={a || undefined} onChange={(e) => setB(e.target.value)} className={SELECT} aria-label="시행 일자 끝" />
      <span className="flex gap-1 text-xs">
        {(
          [
            ["this", "이번 달"],
            ["last", "지난달"],
            ["year", "올해"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" onClick={() => preset(k)} className="rounded border border-gray-300 bg-white px-1.5 py-1 text-gray-600 hover:border-brand-700">
            {l}
          </button>
        ))}
        {(a || b) && (
          <button type="button" onClick={() => (setA(""), setB(""))} className="rounded px-1.5 py-1 text-gray-500 hover:underline">
            지우기
          </button>
        )}
      </span>
    </div>
  );
}
