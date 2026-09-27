"use client";

// 점검 현황 엑셀 : 기존 "2026_CEO 안전점검.xlsx" 양식과 같은 배치·서식
//   제목 E1:N3 (맑은 고딕 20 굵게) · 범례 O1:Q3 · 헤더 5~6행 (개선 계획 I5:K5 아래 즉시/단기/장기)
//   데이터 7행부터 (높이 150) · H 개선 전 사진 · M 개선 후 사진 · 완료 칸 노란색 · 변경된 일정은 빨간 글씨
import type { Borders, Cell, Fill, Font, RichText, Workbook, Worksheet } from "exceljs";
import { MEASURE_KINDS, MEASURE_LABEL } from "./labels";
import type { FindingRow } from "./finding-rows";

const FONT = "맑은 고딕";
const WIDTHS = [3.375, 5.25, 13, 17.25, 19.875, 10, 38.375, 28, 39.25, 42.625, 45.875, 24.375, 29.375, 15, 11.75, 16.375, 30.875, 31];
const HEADER_FILL: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB4C6E7" } }; // 원본: 테마 강조1 + 밝게 60%
const CURRENT_FILL: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
const DONE_FILL: Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
const thin = { style: "thin" as const };
const BOX: Partial<Borders> = { top: thin, left: thin, bottom: thin, right: thin };
const ROW_HEIGHT = 150; // pt (= 200px)
const RED = { argb: "FFFF0000" };

const font = (extra: Partial<Font> = {}): Partial<Font> => ({ name: FONT, size: 11, family: 3, charset: 129, ...extra });
const ymd = (d: string | null | undefined) => (d ? d.slice(2, 10).replaceAll("-", ".") : "");
const monthLabel = (d: string) => `${d.slice(2, 4)}년 ${Number(d.slice(5, 7))}월`;

export type ExcelOptions = {
  title: string; // 예) CEO 안전점검 현황 (8월 점검 현황 + 이전 점검 미완료 현황)
  fileName: string;
  currentMonth?: string; // YYYY-MM : 이 달 점검 행을 회색으로 (범례 "당월 점검 현황")
  showModule?: boolean; // 부서별 현황 : 시행 월 칸에 점검 종류 표기
  onProgress?: (message: string) => void;
};

function scheduleRich(r: FindingRow): RichText[] {
  const parts: RichText[] = [];
  const kinds = MEASURE_KINDS.filter((k) => r.measures[k]);
  kinds.forEach((k, i) => {
    const m = r.measures[k]!;
    if (i > 0) parts.push({ text: "\n", font: font() });
    parts.push({ text: `${kinds.length > 1 ? `${MEASURE_LABEL[k].slice(0, 2)} ` : ""}${ymd(m.original)}`, font: font() });
    for (const c of m.changes) parts.push({ text: `\n→ ${ymd(c)}`, font: font({ color: RED }) });
    if (m.done) parts.push({ text: "(완료)", font: font() });
  });
  return parts.length ? parts : [{ text: "-", font: font() }];
}

function progressText(r: FindingRow) {
  const p = r.progress[0];
  if (!p) return "";
  return p.reason === "기존 엑셀 기록" ? p.progress : `□ 진행 현황\n${p.progress}\n\n□ 미완료 사유\n${p.reason}`;
}

async function loadImage(url: string): Promise<{ base64: string; width: number; height: number } | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    const base64 = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
    return { base64, ...size };
  } catch {
    return null;
  }
}

// 셀(열 너비 px × 200px) 안에 비율 유지하며 배치, 2장이면 위아래로
async function placeImages(wb: Workbook, ws: Worksheet, urls: string[], col: number, rowNo: number) {
  const cellW = WIDTHS[col] * 7 + 5;
  const cellH = (ROW_HEIGHT * 4) / 3;
  const slotH = (cellH - 8) / Math.max(1, urls.length);
  for (const [i, url] of urls.entries()) {
    const img = await loadImage(url);
    if (!img) continue;
    const scale = Math.min((cellW - 10) / img.width, (slotH - 4) / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const id = wb.addImage({ base64: img.base64, extension: "jpeg" });
    const offX = (cellW - w) / 2 / cellW;
    const offY = (4 + i * slotH + (slotH - h) / 2) / cellH;
    ws.addImage(id, { tl: { col: col + offX, row: rowNo - 1 + offY }, ext: { width: w, height: h }, editAs: "oneCell" });
  }
}

function styleCell(cell: Cell, opts: { align?: "left" | "center"; fill?: Fill; font?: Partial<Font> } = {}) {
  cell.font = opts.font ?? font({ color: { theme: 1 } });
  cell.alignment = { horizontal: opts.align ?? "center", vertical: "middle", wrapText: true };
  cell.border = BOX;
  if (opts.fill) cell.fill = opts.fill;
}

export async function exportFindingsExcel(rows: FindingRow[], opts: ExcelOptions) {
  const say = opts.onProgress ?? (() => {});
  say("준비 중…");
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("점검현황", {
    views: [{ state: "frozen", ySplit: 6, zoomScale: 60, zoomScaleNormal: 60 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "5:6" },
  });
  ws.columns = WIDTHS.map((width) => ({ width }));

  // ---- 제목 / 범례
  ws.mergeCells("E1:N3");
  const title = ws.getCell("E1");
  title.value = opts.title;
  title.font = font({ bold: true, size: 20, color: { theme: 1 } });
  title.alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 5; c <= 14; c++) {
    ws.getCell(1, c).border = { top: { style: "medium" } };
    ws.getCell(3, c).border = { bottom: { style: "medium" } };
  }
  ws.getRow(3).height = 17.25;
  ws.mergeCells("O1:Q1");
  const note = ws.getCell("O1");
  note.value = "* 참고";
  note.font = font({ bold: true, color: { theme: 1 } });
  note.alignment = { horizontal: "center", vertical: "middle" };
  if (opts.currentMonth) {
    ws.getCell("O3").fill = CURRENT_FILL;
    ws.getCell("O3").border = BOX;
    const legend = ws.getCell("P3");
    legend.value = ": 당월 점검 현황";
    legend.font = font({ bold: true, color: { theme: 1 } });
    legend.alignment = { horizontal: "left", vertical: "middle" };
  }

  // ---- 헤더 (5~6행)
  const heads = ["NO", "시행 월", "장소", "세부장소", "유형", "문제점", "개선 전 사진", "개선 계획", "", "", "개선일정", "개선 후 사진", "담당부서", "담당자", "완료여부", "미완료 이유 및 진행 현황"];
  heads.forEach((h, i) => {
    const col = i + 2;
    for (const r of [5, 6]) {
      const cell = ws.getCell(r, col);
      cell.value = h;
      styleCell(cell, { fill: HEADER_FILL, font: font({ bold: true, color: { theme: 1 } }) });
    }
  });
  ["즉시조치", "단기대책 (한달 이내)", "장기대책 (한달 초과)"].forEach((h, i) => (ws.getCell(6, 9 + i).value = h));
  for (let c = 2; c <= 17; c++) if (c < 9 || c > 11) ws.mergeCells(5, c, 6, c);
  ws.mergeCells("I5:K5");
  ws.getCell("I5").value = "개선 계획";
  ws.getRow(6).height = 20.25;

  // ---- 데이터 (7행~)
  for (const [i, r] of rows.entries()) {
    say(`작성 중… (${i + 1}/${rows.length})`);
    const rowNo = 7 + i;
    const row = ws.getRow(rowNo);
    row.height = ROW_HEIGHT;
    const current = opts.currentMonth && r.inspection_date.startsWith(opts.currentMonth);
    const carried = opts.currentMonth && r.inspection_date < `${opts.currentMonth}-01`;
    const fill = current ? CURRENT_FILL : undefined;
    const closed = r.status === "closed";
    const m = (k: (typeof MEASURE_KINDS)[number]) => r.measures[k]?.content ?? "-";

    const values: [number, unknown, "left" | "center"][] = [
      [2, i + 1, "center"],
      [3, `${opts.showModule ? `${r.module_name}\n` : ""}${monthLabel(r.inspection_date)}${carried ? "\n이월" : ""}`, "center"],
      [4, r.location_name ?? "-", "center"],
      [5, r.sub_location_name ?? "-", "center"],
      [6, r.type_name ?? "-", "center"],
      [7, r.problem, "left"],
      [8, "", "center"],
      [9, m("immediate"), "left"],
      [10, m("short"), "left"],
      [11, m("long"), "left"],
      [12, { richText: scheduleRich(r) }, "center"],
      [13, "", "center"],
      [14, r.department_name, "center"],
      [15, (r.assignee_names ?? "-").replaceAll(", ", "\n"), "center"],
      [16, closed ? "완료" : "-", "center"],
      [17, progressText(r), "left"],
    ];
    for (const [col, value, align] of values) {
      const cell = ws.getCell(rowNo, col);
      cell.value = value as Cell["value"];
      styleCell(cell, { align, fill });
    }
    if (closed) ws.getCell(rowNo, 16).fill = DONE_FILL;
    if (r.is_overdue) ws.getCell(rowNo, 16).font = font({ bold: true, color: RED });

    if (r.directives.length) {
      const cell = ws.getCell(rowNo, 18);
      cell.value = { richText: [{ text: "지시사항\n", font: font({ bold: true, color: RED }) }, { text: r.directives.join("\n\n"), font: font() }] };
      cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    }

    say(`사진 넣는 중… (${i + 1}/${rows.length})`);
    await placeImages(wb, ws, r.beforeUrls, 7, rowNo);
    await placeImages(wb, ws, r.afterUrls, 12, rowNo);
  }
  const last = 6 + Math.max(rows.length, 1);
  ws.autoFilter = `B6:Q${last}`;
  ws.pageSetup.printArea = `B1:Q${last}`;

  say("파일 만드는 중…");
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.fileName;
  a.click();
  URL.revokeObjectURL(url);
}
