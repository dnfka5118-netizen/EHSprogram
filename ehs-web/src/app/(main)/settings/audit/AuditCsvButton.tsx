"use client";

type Line = { at: string; actor: string; category: string; action: string; target: string; detail: string };

// 지금 보이는 감사 로그를 엑셀에서 열 수 있는 CSV 로 내려받기
export function AuditCsvButton({ rows }: { rows: Line[] }) {
  const download = () => {
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = ["일시,처리자,분류,작업,대상,바뀐 내용", ...rows.map((r) => [r.at, r.actor, r.category, r.action, r.target, r.detail].map(cell).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `감사로그_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button type="button" onClick={download} disabled={rows.length === 0} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
      엑셀(CSV) 다운로드
    </button>
  );
}
