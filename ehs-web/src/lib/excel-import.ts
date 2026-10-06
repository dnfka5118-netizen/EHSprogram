"use client";

// 엑셀로 추가 : 프로그램에서 내려받은 현황 엑셀 양식(excel-export.ts)에 적은 지적사항을 읽는다
//   헤더 5~6행 · 데이터 7행부터 · C 시행일 · D 장소 · E 세부장소 · F 유형 · G 문제점 · H 개선 전 사진 · N 담당부서
//   T(숨김) 프로그램 ID 가 있는 행 = 이미 등록된 건 → 건너뜀
import type { Worksheet } from "exceljs";
import { ID_COL } from "./excel-export";

export type ImportRow = {
  excelRow: number;
  date: string | null; // YYYY-MM-DD (올바른 날짜일 때만)
  dateText: string; // 엑셀에 적힌 그대로 (안내용)
  dateError: string | null; // 날짜를 읽을 수 없거나 없는 날짜
  location: string;
  sub: string;
  type: string;
  problem: string;
  department: string;
  photos: Blob[];
  existingId: string | null;
};

const text = (v: unknown): string => {
  if (v == null) return "";
  if (v instanceof Date) return "";
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: unknown };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if ("result" in o) return text(o.result);
    if (o.text) return String(o.text);
    return "";
  }
  return String(v);
};
const clean = (s: string) => s.replace(/​/g, "").replace(/\r/g, "").trim();
const one = (s: string) => clean(s).split(/\s*\n\s*/).filter(Boolean).join(" ");
const pad = (n: number) => String(n).padStart(2, "0");

// 날짜 : 엑셀 날짜 · 26.10.05 · 2026-10-05 · 2026.10.05 · "26년 10월"(→ 1일) · "26년 10월 5일"
//   2월 30일 · 13월 처럼 없는 날짜는 오류
export function parseDateStrict(v: unknown): { date: string | null; text: string; error: string | null } {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return { date: null, text: "", error: "날짜를 읽을 수 없습니다" };
    return { date: `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`, text: "", error: null };
  }
  if (typeof v === "number" && v > 30000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); // 엑셀 날짜 숫자
    return { date: d.toISOString().slice(0, 10), text: String(v), error: null };
  }
  const t = clean(text(v));
  if (!t) return { date: null, text: "", error: "시행일이 비어 있습니다" };
  const build = (yy: number, mm: number, dd: number) => {
    const y = yy < 100 ? 2000 + yy : yy;
    if (y < 2000 || y > 2100) return { date: null, text: t, error: `'${t}' 의 연도가 올바르지 않습니다` };
    if (mm < 1 || mm > 12) return { date: null, text: t, error: `'${t}' 은(는) 없는 달입니다 (${mm}월)` };
    const last = new Date(Date.UTC(y, mm, 0)).getUTCDate();
    if (dd < 1 || dd > last) return { date: null, text: t, error: `'${t}' 은(는) 없는 날짜입니다 (${mm}월은 ${last}일까지)` };
    return { date: `${y}-${pad(mm)}-${pad(dd)}`, text: t, error: null };
  };
  let m = t.match(/^(\d{2,4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\.?$/);
  if (m) return build(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{2,4})\s*년\s*(\d{1,2})\s*월(?:\s*(\d{1,2})\s*일)?$/);
  if (m) return build(+m[1], +m[2], +(m[3] ?? 1));
  return { date: null, text: t, error: `'${t}' 은(는) 날짜 형식이 아닙니다 (예: 26.10.05)` };
}

export function parseDate(v: unknown): string | null {
  return parseDateStrict(v).date;
}

export async function readImportFile(file: File): Promise<ImportRow[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  let ws: Worksheet | undefined;
  let headerRow = 0;
  for (const sheet of wb.worksheets) {
    sheet.eachRow((row, r) => {
      if (!headerRow && clean(text(row.getCell(2).value)).toUpperCase() === "NO") headerRow = r;
    });
    if (headerRow) {
      ws = sheet;
      break;
    }
  }
  if (!ws || !headerRow) throw new Error("NO 머리글을 찾지 못했습니다. 프로그램에서 내려받은 엑셀 양식으로 작성해 주세요.");
  const head = (c: number) => clean(text(ws!.getRow(headerRow).getCell(c).value)).replace(/\s+/g, "");
  if (head(4) !== "장소" || !head(7).startsWith("문제점")) throw new Error("양식이 다릅니다. 프로그램의 '엑셀 다운로드'로 받은 양식을 사용해 주세요.");
  const firstDataRow = headerRow + 2; // 개선 계획 아래 즉시/단기/장기 머리글 다음

  // 개선 전 사진 (H열, 칸을 살짝 넘는 경우 앞뒤 1열) → 행
  const photos = new Map<number, Blob[]>();
  const media = (wb.model as unknown as { media: { buffer: ArrayBuffer; extension: string }[] }).media;
  for (const im of ws.getImages()) {
    const tl = im.range.tl as unknown as { nativeRow: number; nativeRowOff?: number; nativeCol: number };
    const c1 = Math.floor(tl.nativeCol) + 1;
    if (c1 < 7 || c1 > 9) continue;
    let row = Math.floor(tl.nativeRow) + 1;
    if ((tl.nativeRowOff ?? 0) / 12700 > (ws.getRow(row).height ?? 15) * 0.6) row += 1;
    const m = media[Number(im.imageId)];
    if (!m || !["png", "jpeg", "jpg"].includes(m.extension)) continue;
    const list = photos.get(row) ?? [];
    list.push(new Blob([m.buffer], { type: m.extension === "png" ? "image/png" : "image/jpeg" }));
    photos.set(row, list);
  }

  const out: ImportRow[] = [];
  for (let r = firstDataRow; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const v = (c: number) => row.getCell(c).value;
    const problem = clean(text(v(7)));
    const pics = photos.get(r) ?? [];
    if (!problem && pics.length === 0) continue; // 빈 행
    const id = clean(text(v(ID_COL)));
    out.push({
      excelRow: r,
      ...(({ date, text: dateText, error: dateError }) => ({ date, dateText, dateError }))(parseDateStrict(v(3))),
      location: one(text(v(4))),
      sub: one(text(v(5))).replace(/^-$/, ""),
      type: clean(text(v(6))).replace(/^-$/, ""),
      problem,
      department: one(text(v(14))).replace(/^-$/, ""),
      photos: pics,
      existingId: /^[0-9a-f-]{36}$/i.test(id) ? id : null,
    });
  }
  return out;
}
