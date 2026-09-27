"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { STATUS_LABEL } from "@/lib/labels";
import type { FindingStatus, MeasureKind } from "@/lib/types";

export type ReportRow = {
  no: number;
  month: string;
  location: string;
  subLocation: string;
  type: string;
  problem: string;
  measures: Record<MeasureKind, string>;
  schedule: string;
  department: string;
  assignees: string;
  status: FindingStatus;
  overdue: boolean;
  progress: string;
  directives: string;
  before: string[];
  after: string[];
  href: string;
};

const COLUMNS: { header: string; width: number }[] = [
  { header: "NO", width: 5 },
  { header: "시행 월", width: 12 },
  { header: "장소", width: 16 },
  { header: "세부장소", width: 14 },
  { header: "유형", width: 10 },
  { header: "문제점", width: 40 },
  { header: "개선 전 사진", width: 30 },
  { header: "즉시조치", width: 30 },
  { header: "단기대책 (한달 이내)", width: 30 },
  { header: "장기대책 (한달 초과)", width: 30 },
  { header: "개선일정", width: 28 },
  { header: "개선 후 사진", width: 30 },
  { header: "담당부서", width: 12 },
  { header: "담당자", width: 12 },
  { header: "완료여부", width: 10 },
  { header: "미완료 이유 및 진행 현황", width: 40 },
  { header: "지시사항", width: 30 },
];
const BEFORE_COL = 6; // 0 기준 G열
const AFTER_COL = 11; // 0 기준 L열
const ROW_HEIGHT = 125; // pt

async function toBase64(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function ExportButton({ rows, title, fileName }: { rows: ReportRow[]; title: string; fileName: string }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function run() {
    setBusy("준비 중…");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("점검현황", { views: [{ state: "frozen", ySplit: 3 }] });
      ws.columns = COLUMNS.map((c) => ({ width: c.width }));

      ws.mergeCells(1, 1, 1, COLUMNS.length);
      const t = ws.getCell(1, 1);
      t.value = title;
      t.font = { size: 16, bold: true };
      t.alignment = { vertical: "middle", horizontal: "center" };
      ws.getRow(1).height = 32;

      const header = ws.getRow(3);
      COLUMNS.forEach((c, i) => {
        const cell = header.getCell(i + 1);
        cell.value = c.header;
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
      });
      header.height = 24;

      const border = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
      const styleRow = (r: number) =>
        ws.getRow(r).eachCell({ includeEmpty: true }, (cell) => {
          cell.border = { top: border, left: border, bottom: border, right: border };
          cell.alignment = { vertical: "middle", wrapText: true, ...(cell.alignment ?? {}) };
        });
      styleRow(3);
      header.eachCell((c) => (c.alignment = { vertical: "middle", horizontal: "center", wrapText: true }));

      for (const [i, r] of rows.entries()) {
        setBusy(`사진 넣는 중… (${i + 1}/${rows.length})`);
        const rowNo = 4 + i;
        const row = ws.getRow(rowNo);
        row.values = [
          r.no,
          r.month,
          r.location,
          r.subLocation,
          r.type,
          r.problem,
          "",
          r.measures.immediate,
          r.measures.short,
          r.measures.long,
          r.schedule,
          "",
          r.department,
          r.assignees,
          r.status === "closed" ? "완료" : STATUS_LABEL[r.status],
          r.progress,
          r.directives,
        ];
        row.height = ROW_HEIGHT;
        for (let c = 1; c <= COLUMNS.length; c++) row.getCell(c);
        styleRow(rowNo);
        [1, 2, 5, 13, 14, 15].forEach((c) => (row.getCell(c).alignment = { vertical: "middle", horizontal: "center", wrapText: true }));
        if (r.overdue) row.getCell(11).font = { color: { argb: "FFC00000" }, bold: true };

        for (const [col, urls] of [[BEFORE_COL, r.before], [AFTER_COL, r.after]] as const) {
          if (!urls[0]) continue;
          const data = await toBase64(urls[0]);
          if (!data) continue;
          const id = wb.addImage({ base64: data, extension: "jpeg" });
          ws.addImage(id, { tl: { col: col + 0.05, row: rowNo - 1 + 0.05 }, ext: { width: 200, height: 155 }, editAs: "oneCell" });
        }
      }

      setBusy("파일 만드는 중…");
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`엑셀 생성 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Button variant="secondary" onClick={run} disabled={!!busy || rows.length === 0}>
      {busy ?? "엑셀 다운로드"}
    </Button>
  );
}
