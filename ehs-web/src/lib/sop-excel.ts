"use client";

// 안전운전 절차서 CF410-01 R02 엑셀 내보내기 · 불러오기 (원본 양식과 같은 셀 배치 · 단계 사진 포함)
//   시트 1 "제개정 이력" / 시트 2 "SOP" (작업 단계가 많아도 한 시트에 이어서)
//   불러오기는 셀 주소 대신 칸 이름(표준번호 · 공정명 · 작업 단계 …)으로 찾아서 예전 양식(열이 한 칸 밀린 파일)도 읽음
import type { Borders, Cell, Workbook, Worksheet } from "exceljs";
import { HAZARD_COLS, PURPOSES, SOP_FORM_NO, emptyStep, type SopForm, type SopHistory } from "./sop";
import type { DeptHead } from "./approval-line";

const thin = { style: "thin" as const, color: { argb: "FF000000" } };
const BOX: Partial<Borders> = { top: thin, left: thin, bottom: thin, right: thin };
const HEAD_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF2F2F2" } };
const FONT = { name: "맑은 고딕", size: 10 };
const pageSetup = { orientation: "landscape" as const, paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: 0.4, right: 0.3, top: 0.4, bottom: 0.5, header: 0.2, footer: 0.2 } };

type Opts = { border?: boolean; head?: boolean; bold?: boolean; size?: number; align?: "left" | "center"; top?: boolean };

function put(ws: Worksheet, range: string, value: string | number | null, o: Opts = {}) {
  if (range.includes(":")) ws.mergeCells(range);
  const [a, b] = range.split(":");
  ws.getCell(a).value = value ?? "";
  const s = ws.getCell(a);
  const e = ws.getCell(b ?? a);
  for (let r = Number(s.row); r <= Number(e.row); r++)
    for (let c = Number(s.col); c <= Number(e.col); c++) {
      const cell = ws.getCell(r, c);
      if (o.border !== false) cell.border = BOX;
      if (o.head) cell.fill = HEAD_FILL;
      cell.font = { ...FONT, bold: !!o.bold, size: o.size ?? FONT.size };
      cell.alignment = { vertical: o.top ? "top" : "middle", horizontal: o.align ?? "center", wrapText: true };
    }
}

// 칸 너비(엑셀 글자 수) 안에서 줄 수 추정 (한글은 1.8칸)
function lines(s: string, width: number) {
  return s.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil([...l].reduce((w, ch) => w + (/[ㄱ-힣]/.test(ch) ? 1.8 : 1), 0) / Math.max(4, width - 1))), 0);
}
const mark = (on: boolean, label: string) => `${on ? "■" : "□"} ${label}`;

export type SopExportMeta = {
  rev: number;
  departmentName: string;
  riskNo: string;
  photoUrls: Record<string, string>; // 사진 경로 → 내려받을 수 있는 URL
  stamps?: string[]; // 이번 Rev. [작성, 검토, 검토, 승인] "이름\n일시"
};

export async function buildSopWorkbook(f: SopForm, meta: SopExportMeta) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  buildHistory(wb, f, meta);
  await buildSop(wb, f, meta);
  return wb;
}

export async function exportSopExcel(f: SopForm, meta: SopExportMeta) {
  const buf = await (await buildSopWorkbook(f, meta)).xlsx.writeBuffer();
  const base = `CF410-01_${f.sop_no || f.title || "작성중"}_Rev${meta.rev}`.replace(/[\\/:*?"<>|\s]+/g, "_");
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${base}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildHistory(wb: Workbook, f: SopForm, meta: SopExportMeta) {
  const ws = wb.addWorksheet("제개정 이력", { views: [{ showGridLines: false }], pageSetup: { ...pageSetup, fitToHeight: 1 } });
  ws.columns = Array.from({ length: 10 }, () => ({ width: 14.6 }));
  ws.getRow(1).height = 5;
  put(ws, "A2:B3", "삼영순화(주)", { bold: true });
  put(ws, "C2:G3", f.title, { bold: true, size: 16 });
  put(ws, "H2", "표준번호", { head: true, bold: true });
  put(ws, "I2:J2", f.sop_no);
  put(ws, "H3", "공정명", { head: true, bold: true });
  put(ws, "I3:J3", f.process_name);
  ws.getRow(2).height = 32;
  ws.getRow(3).height = 32;
  ws.getRow(4).height = 5;
  ["NO", "Rev. No", "변경 내용", "", "", "일자", "작성", "검토", "검토", "승인"].forEach((h, i) => {
    if (i === 2) put(ws, "C5:E5", h, { head: true, bold: true });
    else if (i < 2 || i > 4) put(ws, ws.getCell(5, i + 1).address, h, { head: true, bold: true });
  });
  ws.getRow(5).height = 34;
  const history = [...f.history].sort((a, b) => a.rev - b.rev);
  const n = Math.max(7, history.length);
  for (let i = 0; i < n; i++) {
    const r = 6 + i;
    const h = history[i];
    const mine = h && h.rev === meta.rev;
    put(ws, `A${r}`, h ? i + 1 : "");
    put(ws, `B${r}`, h ? h.rev : "");
    put(ws, `C${r}:E${r}`, h?.content ?? "", { align: "left" });
    put(ws, `F${r}`, h?.date ?? "");
    ["G", "H", "I", "J"].forEach((c, k) => put(ws, `${c}${r}`, mine ? (meta.stamps?.[k] ?? "") : "", { size: 8 }));
    ws.getRow(r).height = 33;
  }
  const t = 6 + n;
  put(ws, `A${t}:J${t}`, "표 준 회 람", { head: true, bold: true });
  for (let c = 0; c < 10; c++) put(ws, ws.getCell(t + 1, c + 1).address, c % 2 ? "회람 일자" : "성명", { head: true, bold: true });
  for (let r = t; r <= t + 8; r++) {
    if (r > t + 1) for (let c = 1; c <= 10; c++) put(ws, ws.getCell(r, c).address, "");
    ws.getRow(r).height = 33;
  }
  foot(ws, t + 9, ["A", "E", "J"]);
}

function foot(ws: Worksheet, r: number, cols: [string, string, string] | string[]) {
  [`양식 ${SOP_FORM_NO}`, "삼영순화주식회사", "A4(297X210)"].forEach((v, i) => {
    const c = ws.getCell(`${cols[i]}${r}`);
    c.value = v;
    c.font = { ...FONT, size: 8 };
  });
}

// SOP 시트 열 너비 (원본 양식 그대로) · 사진 칸 = D:F
const SOP_WIDTHS = [5.8, 7.8, 7.8, 7.8, 9.8, 10.8, 3.8, 17.2, 13.8, 27.4, 28.3, 12.9, 17.7];
const colPx = (w: number) => Math.floor(w * 7 + 5);
const PHOTO_COLS = [3, 4, 5]; // 0부터 센 D, E, F
const PHOTO_W = PHOTO_COLS.reduce((n, c) => n + colPx(SOP_WIDTHS[c]), 0);

async function buildSop(wb: Workbook, f: SopForm, meta: SopExportMeta) {
  const ws = wb.addWorksheet("SOP", { views: [{ showGridLines: false, state: "frozen", ySplit: 12 }], pageSetup: { ...pageSetup, printTitlesRow: "12:12" } });
  ws.columns = SOP_WIDTHS.map((width) => ({ width }));
  const H = { head: true, bold: true };

  put(ws, "A1:C4", "삼영순화(주)", { bold: true });
  put(ws, "D1:K4", f.title, { bold: true, size: 20 });
  put(ws, "L1", "표준번호", H);
  put(ws, "M1", f.sop_no);
  put(ws, "L2", "위험성평가\n작업번호", { ...H, size: 9 });
  put(ws, "M2", meta.riskNo);
  put(ws, "L3", "위험등급", H);
  put(ws, "M3", f.grade ? `${f.grade}등급` : "");
  put(ws, "L4", "Rev.", H);
  put(ws, "M4", meta.rev);
  [20, 28, 20, 20].forEach((h, i) => (ws.getRow(i + 1).height = h));

  put(ws, "A5:B5", "공 정 명", H);
  put(ws, "C5:E5", f.process_name);
  put(ws, "F5", "작성부서", H);
  put(ws, "G5:H5", meta.departmentName);
  put(ws, "I5:K5", "취급물질의 주요물성 및 유해 위험성", H);
  put(ws, "L5:M5", "비상 연락처", H);
  put(ws, "A6:B6", "적용범위", H);
  put(ws, "C6:E6", f.scope);
  put(ws, "F6", "작 성 자", H);
  put(ws, "G6:H6", f.writers);
  put(ws, "I6:K9", f.materials, { align: "left", top: true });
  put(ws, "L6:M9", f.contacts, { align: "left", top: true });
  put(ws, "A7:B7", "용     도", H);
  put(ws, "C7:H7", PURPOSES.map((p) => mark(f.purposes.includes(p), p)).join("  "), { align: "left" });
  put(ws, "A8:B8", "준 비 물", H);
  put(ws, "C8:H8", f.supplies, { align: "left" });
  put(ws, "A9:B9", "개인 보호구", H);
  put(ws, "C9:H9", f.ppe, { align: "left" });
  [5, 6, 8, 9].forEach((r) => (ws.getRow(r).height = 20));
  ws.getRow(7).height = 55;
  // 취급물질 · 비상연락처 칸이 넘치면 6~9행을 같이 늘림
  const need = Math.max(lines(f.materials, 69.5), lines(f.contacts, 30.6)) * 13 + 8;
  if (need > 115) [6, 8, 9].forEach((r) => (ws.getRow(r).height = 20 + (need - 115) / 3));

  put(ws, "A10:I10", "유해위험 요인 Check", H);
  put(ws, "J10:M10", "이상발생시 조치요령", H);
  ["A11:C11", "D11:E11", "F11:G11", "H11"].forEach((rg, i) => put(ws, rg, HAZARD_COLS[i].map((h) => mark(f.hazards.includes(h), h)).join("\n"), { align: "left" }));
  put(ws, "I11", "□ 기타 위험\n-\n-\n-\n-\n-", { align: "left" });
  put(ws, "J11:M11", f.emergency, { align: "left" });
  ws.getRow(10).height = 20;
  ws.getRow(11).height = Math.max(89, lines(f.emergency, 86.3) * 13 + 8);

  put(ws, "A12", "No", H);
  put(ws, "B12:C12", "작업 단계", H);
  put(ws, "D12:F12", "사진", H);
  put(ws, "G12:H12", "유해위험 요인", H);
  put(ws, "I12:J12", "작업 내용", H);
  put(ws, "K12", "안전 대책", H);
  put(ws, "L12:M12", "안전설비 및 작업\n관리기준", H);
  ws.getRow(12).height = 30;

  // 사진은 미리 모두 내려받음 (크기를 알아야 칸에 맞춰 넣음)
  const imgs = new Map<string, { id: number; w: number; h: number }>();
  await Promise.all(
    f.steps.flatMap((s) => s.photos).map(async (p) => {
      const url = meta.photoUrls[p];
      if (!url) return;
      try {
        const blob = await (await fetch(url)).blob();
        const bmp = await createImageBitmap(blob);
        const size = { w: bmp.width, h: bmp.height };
        bmp.close();
        const id = wb.addImage({ buffer: (await blob.arrayBuffer()) as never, extension: /png/.test(blob.type) ? "png" : "jpeg" });
        imgs.set(p, { id, ...size });
      } catch {
        // 내려받지 못한 사진은 빼고 만듦
      }
    }),
  );

  let r = 13;
  for (const [i, s] of f.steps.entries()) {
    put(ws, `A${r}`, i + 1);
    put(ws, `B${r}:C${r}`, s.name, { bold: true });
    put(ws, `D${r}:F${r}`, "");
    put(ws, `G${r}:H${r}`, s.hazard, { align: "left", top: true });
    put(ws, `I${r}:J${r}`, s.work, { align: "left", top: true });
    put(ws, `K${r}`, s.safety, { align: "left", top: true });
    put(ws, `L${r}:M${r}`, s.standard, { align: "left", top: true });
    const photos = s.photos.map((p) => imgs.get(p)).filter((x) => !!x);
    const cols = photos.length > 1 ? 2 : 1;
    const cellW = (PHOTO_W - 8) / cols;
    const cellH = photos.length ? (cols === 1 ? 150 : 80) : 0;
    const photoPx = Math.ceil(photos.length / cols) * cellH + 8;
    const textPt = Math.max(lines(s.name, 15.6), lines(s.hazard, 21), lines(s.work, 41.2), lines(s.safety, 28.3), lines(s.standard, 30.6)) * 13 + 8;
    const heightPt = Math.max(74, textPt, photoPx * 0.75);
    ws.getRow(r).height = heightPt;
    photos.forEach((im, k) => {
      const scale = Math.min((cellW - 4) / im.w, (cellH - 4) / im.h);
      const w = im.w * scale;
      const h = im.h * scale;
      const x = 4 + (k % cols) * cellW + (cellW - w) / 2;
      const y = 4 + Math.floor(k / cols) * cellH + (cellH - h) / 2;
      ws.addImage(im.id, { tl: { col: colAt(x), row: r - 1 + y / (heightPt / 0.75) }, ext: { width: w, height: h }, editAs: "oneCell" } as never);
    });
    r++;
  }
  foot(ws, r + 1, ["A", "I", "M"]);
}

// 사진 칸(D:F) 왼쪽에서 px 만큼 떨어진 위치 → 엑셀 열 번호(소수)
function colAt(px: number) {
  let left = px;
  for (const c of PHOTO_COLS) {
    const w = colPx(SOP_WIDTHS[c]);
    if (left < w) return c + left / w;
    left -= w;
  }
  return PHOTO_COLS[PHOTO_COLS.length - 1] + 1;
}

// ---------------------------------------------------------------- 불러오기
export type SopImport = {
  form: Partial<SopForm>;
  photos: Blob[][]; // 단계별 사진 (올리기 전)
  departmentName: string;
  riskNo: string;
  notes: string[];
};

function text(cell: Cell | undefined): string {
  if (!cell) return "";
  const v = cell.value as unknown;
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: string };
    if (o.richText) return o.richText.map((x) => x.text).join("").trim();
    if (o.result !== undefined) return String(o.result ?? "").trim();
    if (o.text) return String(o.text).trim();
    return "";
  }
  return String(v).trim();
}
const squash = (s: string) => s.replace(/\s+/g, "");
const clean = (s: string) => (/^[-–]+$/.test(s.trim()) ? "" : s.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim());
const CHECKED = /^[■☑✔✓▣●◼Vv]/;
const date = (s: string) => {
  const m = s.match(/(20\d{2}|\b\d{2})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/);
  if (!m) return "";
  return `${m[1].length === 2 ? `20${m[1]}` : m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
};

// 병합 칸은 왼쪽 위 칸 하나로 (row, col, 끝 열, 글자)
type Box = { row: number; col: number; endCol: number; t: string; k: string };
function boxes(ws: Worksheet): Box[] {
  const out: Box[] = [];
  const ends = new Map<string, number>();
  for (const m of Object.values((ws as unknown as { _merges: Record<string, { model: { left: number; right: number; top: number } }> })._merges)) ends.set(`${m.model.top}:${m.model.left}`, m.model.right);
  ws.eachRow((row, r) =>
    row.eachCell((c, col) => {
      if (c.master !== c) return;
      const t = text(c);
      if (t) out.push({ row: r, col, endCol: ends.get(`${r}:${col}`) ?? col, t, k: squash(t) });
    }),
  );
  return out;
}

const LABELS = ["표준번호", "위험성평가작업번호", "위험등급", "Rev.", "공정명", "작성부서", "적용범위", "작성자", "용도", "준비물", "개인보호구", "취급물질의주요물성및유해위험성", "비상연락처", "표준명"];
const isLabel = (k: string) => LABELS.includes(k) || /^유해위험(요인|요소)Check$/i.test(k) || k === "이상발생시조치요령";

function rightOf(bs: Box[], label: string) {
  const l = bs.find((b) => b.k === label);
  if (!l) return null;
  const v = bs.filter((b) => b.row === l.row && b.col > l.endCol).sort((a, b) => a.col - b.col)[0];
  return v && !isLabel(v.k) ? v.t : "";
}
function below(bs: Box[], test: (k: string) => boolean) {
  const l = bs.find((b) => test(b.k));
  if (!l) return null;
  return bs.filter((b) => b.row > l.row && b.col >= l.col && b.col <= l.endCol).sort((a, b) => a.row - b.row || a.col - b.col)[0] ?? null;
}
// "■ 정상 운전" 처럼 체크된 줄에서 목록에 있는 이름 찾기
function checked(src: string, names: string[]) {
  const on = src
    .split(/\n|(?=[■□☑☐✔✓▣●◼])/)
    .map((l) => l.trim())
    .filter((l) => CHECKED.test(l))
    .map((l) => squash(l.replace(CHECKED, "")));
  return names.filter((n) => on.some((l) => l === squash(n)));
}

export async function importSopExcel(file: File, departments: DeptHead[]): Promise<SopImport> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch (e) {
    throw new Error(`엑셀 파일을 읽는 중 오류가 발생했습니다: ${e instanceof Error ? e.message : String(e)}`);
  }
  const sheets = wb.worksheets.map((ws) => ({ ws, bs: boxes(ws) }));
  const notes: string[] = [];
  // 머리 정보 : 공정명이 있는 시트 (없으면 첫 시트)
  const main = sheets.find((s) => s.bs.some((b) => b.k === "공정명" && s.bs.some((x) => x.k === "작업단계"))) ?? sheets.find((s) => s.bs.some((b) => b.k === "공정명")) ?? sheets[0];
  const val = (label: string) => rightOf(main.bs, label) ?? sheets.map((s) => rightOf(s.bs, label)).find((v) => v) ?? "";

  // 표준명 : 공정명 줄 위쪽에서 칸 이름이 아닌 가장 넓은 칸
  const procRow = main.bs.find((b) => b.k === "공정명")?.row ?? 5;
  const labelCols = new Set(main.bs.filter((b) => b.row < procRow && isLabel(b.k)).map((b) => `${b.row}:${b.col}`));
  const valueOf = new Set(main.bs.filter((b) => b.row < procRow && isLabel(b.k)).map((b) => main.bs.filter((x) => x.row === b.row && x.col > b.endCol).sort((x, y) => x.col - y.col)[0]).filter(Boolean).map((x) => `${x!.row}:${x!.col}`));
  const title = main.bs
    .filter((b) => b.row < procRow && !labelCols.has(`${b.row}:${b.col}`) && !valueOf.has(`${b.row}:${b.col}`) && !/삼영순화/.test(b.t))
    .sort((a, b) => b.endCol - b.col - (a.endCol - a.col))[0]?.t;

  const purposeSrc = val("용도");
  const purposes = checked(purposeSrc, PURPOSES);
  if (CHECKED.test(purposeSrc.replace(/^\s+/, "")) && !purposes.length) notes.push("용도 체크 항목이 지금 양식과 달라 용도는 직접 골라 주세요.");
  const hzHead = main.bs.find((b) => /^유해위험(요인|요소)Check$/i.test(b.k));
  const hazards = hzHead ? checked(main.bs.filter((b) => b.row === hzHead.row + 1).map((b) => b.t).join("\n"), HAZARD_COLS.flat()) : [];
  const grade = val("위험등급").match(/[ABC]/)?.[0] ?? "";

  const form: Partial<SopForm> = {
    title: title && title !== "표준명" ? title : "",
    sop_no: val("표준번호"),
    process_name: val("공정명"),
    writers: val("작성자"),
    scope: val("적용범위"),
    supplies: clean(val("준비물")),
    ppe: clean(val("개인보호구")),
    purposes,
    hazards,
    grade: grade as SopForm["grade"],
  };
  const mat = below(main.bs, (k) => k === "취급물질의주요물성및유해위험성");
  if (mat) form.materials = clean(mat.t);
  const con = below(main.bs, (k) => k === "비상연락처");
  if (con) form.contacts = clean(con.t.replace(/^[〮·•]\s*/gm, ""));
  const em = below(main.bs, (k) => k === "이상발생시조치요령");
  if (em) form.emergency = clean(em.t);

  const departmentName = val("작성부서");
  const key = squash(departmentName);
  const dept = departments.find((d) => squash(d.name) === key) ?? departments.find((d) => key && (key.includes(squash(d.name)) || squash(d.name).includes(key)));
  if (dept) form.department_id = dept.id;
  else if (departmentName) notes.push(`작성부서 '${departmentName}'를 찾지 못해 직접 골라 주세요.`);

  // 작업 단계 : "작업 단계" 머리줄이 있는 모든 시트에서 아래로 (시트가 여러 장이면 이어서)
  const steps: SopForm["steps"] = [];
  const photos: Blob[][] = [];
  let dropped = 0;
  for (const { ws, bs } of sheets) {
    const head = bs.find((b) => b.k === "작업단계");
    if (!head) continue;
    const hr = bs.filter((b) => b.row === head.row);
    const colOf = (test: (k: string) => boolean) => hr.find((b) => test(b.k));
    const c = {
      no: colOf((k) => /^no$/i.test(k)),
      name: head,
      photo: colOf((k) => k === "사진"),
      hazard: colOf((k) => k.includes("위험요인")),
      work: colOf((k) => k === "작업내용"),
      safety: colOf((k) => k === "안전대책"),
      standard: colOf((k) => k.startsWith("안전설비")),
    };
    const at = (r: number, b?: Box) => (b ? clean(text(ws.getCell(r, b.col))) : "");
    const images = ws.getImages().map((im) => ({ row: Math.floor(im.range.tl.nativeRow) + 1, col: im.range.tl.nativeCol, colOff: im.range.tl.nativeColOff, rowOff: im.range.tl.nativeRowOff, id: Number(im.imageId) }));
    for (let r = head.row + 1; r <= ws.rowCount; r++) {
      if (/^양식/.test(text(ws.getCell(r, 1))) || /^양식/.test(at(r, c.no))) break;
      const step = { ...emptyStep(), name: at(r, c.name), hazard: at(r, c.hazard), work: at(r, c.work), safety: at(r, c.safety), standard: at(r, c.standard) };
      const mine = images.filter((im) => im.row === r && (!c.photo || (im.col + 1 >= c.photo.col - 1 && im.col + 1 <= c.photo.endCol + 1)));
      if (!step.name && !step.work && !step.hazard && !mine.length) continue;
      const blobs = mine
        .sort((a, b) => a.rowOff - b.rowOff || a.col - b.col || a.colOff - b.colOff)
        .map((im) => wb.getImage(im.id))
        .filter((m) => m?.buffer)
        .map((m) => new Blob([m.buffer as unknown as ArrayBuffer], { type: `image/${m.extension === "png" ? "png" : m.extension === "gif" ? "gif" : "jpeg"}` }));
      if (blobs.length > 4) dropped += blobs.length - 4;
      steps.push(step);
      photos.push(blobs.slice(0, 4));
    }
  }
  if (!steps.length) throw new Error("엑셀에서 작업 단계 표를 찾지 못했습니다. '작업 단계' 머리줄이 있는 안전운전 절차서 양식인지 확인해 주세요.");
  form.steps = steps;
  if (dropped) notes.push(`사진은 단계마다 4장까지만 가져와 ${dropped}장은 빠졌습니다.`);

  // 제개정 이력
  for (const { ws, bs } of sheets) {
    const head = bs.find((b) => b.k === "변경내용");
    if (!head) continue;
    const hr = bs.filter((b) => b.row === head.row);
    const revC = hr.find((b) => /^rev/i.test(b.k));
    const dateC = hr.find((b) => b.k === "일자");
    const history: SopHistory[] = [];
    for (let r = head.row + 1; r <= ws.rowCount; r++) {
      const content = text(ws.getCell(r, head.col));
      if (/표준회람/.test(squash(content)) || /표준회람/.test(squash(text(ws.getCell(r, 1))))) break;
      const rev = revC ? text(ws.getCell(r, revC.col)) : "";
      if (!content && rev === "") continue;
      history.push({ rev: Number(rev.match(/\d+/)?.[0] ?? 0), content, date: dateC ? date(text(ws.getCell(r, dateC.col))) : "" });
    }
    if (history.length) form.history = history;
    break;
  }

  return { form, photos, departmentName, riskNo: val("위험성평가작업번호"), notes };
}
