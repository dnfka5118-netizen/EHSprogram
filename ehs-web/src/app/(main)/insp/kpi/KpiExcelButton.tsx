"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import type { KpiData, KpiRow } from "./types";

const rate = (r: { late: number; due: number }) => (r.due ? Math.round((r.late / r.due) * 1000) / 10 : null);

// 팀별 · 개인별 · 월별 시트로 된 엑셀 (브라우저에서 생성)
export function KpiExcelButton({ data, title }: { data: KpiData; title: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const ExcelJS = (await import("exceljs")).default;
          const wb = new ExcelJS.Workbook();
          const head = ["발굴", "조치", "목표일 지난 조치", "지연", "지연율(%)", "점검 주기", "미진행"];
          const nums = (r: KpiRow) => [r.found, r.closed, r.due, r.late, rate(r), r.expected || null, r.expected ? r.missed : null];
          const sheet = (name: string, header: string[], rows: (string | number | null)[][]) => {
            const ws = wb.addWorksheet(name);
            ws.addRow([title]).font = { bold: true, size: 13 };
            ws.addRow([data.confirmed_at ? `확정본 (${data.confirmed_at.slice(0, 10)})` : `1월 1일 ~ ${data.as_of} 누적`]);
            const h = ws.addRow(header);
            h.font = { bold: true };
            h.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF8" } }));
            rows.forEach((r) => ws.addRow(r));
            ws.columns.forEach((c, i) => (c.width = i < 3 ? 16 : 12));
          };
          sheet("팀별", ["부문", "팀", ...head], data.teams.map((t) => [t.division ?? "", t.name, ...nums(t)]));
          sheet("개인별", ["이름", "직위", "팀", ...head], data.people.map((p) => [p.name, p.position ?? "", p.team_name ?? "", ...nums(p)]));
          sheet("월별", ["월", "발굴", "조치", "목표일 지난 조치", "지연", "지연율(%)", "미진행"], data.months.map((m) => [`${m.mo}월`, m.found, m.closed, m.due, m.late, rate(m), m.missed]));
          const buf = await wb.xlsx.writeBuffer();
          const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
          const a = document.createElement("a");
          a.href = url;
          a.download = `${title}.xlsx`;
          a.click();
          URL.revokeObjectURL(url);
        } catch (e) {
          alert(`엑셀 생성 실패: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "만드는 중…" : "엑셀 다운로드"}
    </Button>
  );
}
