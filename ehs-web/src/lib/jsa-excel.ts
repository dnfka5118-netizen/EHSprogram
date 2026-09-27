"use client";

// CF112-01/02 R02 엑셀 불러오기 · 내보내기 (원본 도구의 셀 배치와 동일)
//   갑 : 표지(부서·참여자·작업정보·위험유형 집계) / 을 : 작업단계별 상세표
import type { Borders, Cell, Workbook, Worksheet } from "exceljs";
import { CONTROL_OPTS, HAZARD_GROUPS, HAZARD_TYPES, aggregate, emptyControl, emptyJsa, riskOf, type JsaForm, type JsaStep } from "./jsa";
import type { DeptHead } from "./approval-line";

const SHEET1 = "양식 CF112-01(갑), R02";
const SHEET2 = "양식 CF112-01(을), R02";
const thin = { style: "thin" as const, color: { argb: "FF000000" } };
const BOX: Partial<Borders> = { top: thin, left: thin, bottom: thin, right: thin };
const HEAD_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFEEF2F8" } };
const FONT = { name: "Malgun Gothic", size: 9 };

// 위험도 색 (hsl → argb)
function riskArgb(v: number): string {
  const t = Math.min(1, (v - 1) / 24);
  const h = 120 - 120 * t;
  const l = (88 - 28 * t) / 100;
  const s = 0.72;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0").toUpperCase();
  return `FF${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

function styleRange(ws: Worksheet, range: string, opts: { border?: boolean; head?: boolean; bold?: boolean; size?: number; align?: "left" | "center" } = {}) {
  const [a, b] = range.split(":");
  const s = ws.getCell(a);
  const e = ws.getCell(b ?? a);
  for (let r = Number(s.row); r <= Number(e.row); r++)
    for (let c = Number(s.col); c <= Number(e.col); c++) {
      const cell = ws.getCell(r, c);
      if (opts.border !== false) cell.border = BOX;
      if (opts.head) cell.fill = HEAD_FILL;
      cell.font = { ...FONT, bold: !!opts.bold, size: opts.size ?? 9 };
      cell.alignment = { vertical: "middle", horizontal: opts.align ?? "center", wrapText: true };
    }
}

function put(ws: Worksheet, range: string, value: string | number | null, opts: Parameters<typeof styleRange>[2] = {}) {
  if (range.includes(":")) ws.mergeCells(range);
  ws.getCell(range.split(":")[0]).value = value ?? "";
  styleRange(ws, range, opts);
}

const lines = (s: string) => Math.max(1, ...s.split("\n").map((l) => Math.ceil([...l].reduce((n, ch) => n + (/[ㄱ-힣]/.test(ch) ? 1.8 : 1), 0) / 18)));

export async function exportJsaExcel(form: JsaForm, meta: { evalNo: string | null; departmentName: string; stamps?: Partial<Record<"담당" | "검토" | "승인" | "확인", string>> }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  buildCover(wb, form, meta);
  buildDetail(wb, form);
  const buf = await wb.xlsx.writeBuffer();
  const name = `CF112-01_02_${(meta.evalNo ?? "작성중").replace(/[^A-Za-z0-9_-]/g, "")}.xlsx`;
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const pageSetup = { orientation: "landscape" as const, fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9, margins: { left: 0.3, right: 0.3, top: 0.3, bottom: 0.3, header: 0.2, footer: 0.2 } };

function buildCover(wb: Workbook, f: JsaForm, meta: { departmentName: string; stamps?: Partial<Record<string, string>> }) {
  const ws = wb.addWorksheet(SHEET1, { views: [{ showGridLines: false }], pageSetup });
  ws.columns = Array.from({ length: 24 }, (_, i) => ({ width: i === 0 ? 8.125 : i === 21 ? 10.25 : i === 22 ? 8.125 : 8.43 }));

  put(ws, "F1:O3", "작업 위험성평가서 (Job Safety Analysis)", { bold: true, size: 17 });
  put(ws, "P1:P3", "결\n\n재", { bold: true });
  (["Q", "S", "U", "W"] as const).forEach((col, i) => {
    const next = String.fromCharCode(col.charCodeAt(0) + 1);
    const role = ["담당", "검토", "승인", "확인"][i];
    put(ws, `${col}1:${next}1`, ["담 당", "검 토", " 승 인", "확 인"][i], { head: true, bold: true });
    put(ws, `${col}2:${next}3`, meta.stamps?.[role] ?? "", { size: 8 });
  });
  put(ws, "A1:E3", "", { border: false });

  const cnt = (v: string) => (v ? `${v} 명` : "");
  put(ws, "A4:C4", "부서명", { head: true, bold: true });
  put(ws, "D4:L4", meta.departmentName);
  put(ws, "M4:O4", "평가 일자", { head: true, bold: true });
  put(ws, "P4:X4", f.eval_date);
  put(ws, "A5:C7", "평가 참여자", { head: true, bold: true });
  put(ws, "M5:O7", "평가 참여 인원수", { head: true, bold: true });
  [
    ["관리감독자", f.super_name, f.super_count],
    ["작업자", f.worker_name, f.worker_count],
    ["E     H    S", f.ehs_name, f.ehs_count],
  ].forEach(([label, name, count], i) => {
    const r = 5 + i;
    put(ws, `D${r}:E${r}`, label, { head: true });
    put(ws, `F${r}:L${r}`, name);
    put(ws, `P${r}:Q${r}`, label, { head: true });
    put(ws, `R${r}:X${r}`, cnt(count));
  });
  const pairs: [number, string, string, string, string][] = [
    [8, "작업 지역", f.work_area, "작업명\n작업 번호", f.work_no ? `${f.work_name} (${f.work_no})` : f.work_name],
    [9, "S   O   P 번호", f.sop_no, "취급 물질", f.material],
    [10, "필요 보호구", f.ppe, "필요\n(측정)장비/공구", f.equip],
    [11, "필요 안전장비", f.safety_equip, "필요 자료", f.req_docs],
  ];
  for (const [r, l1, v1, l2, v2] of pairs) {
    put(ws, `A${r}:C${r}`, l1, { head: true, bold: true });
    put(ws, `D${r}:L${r}`, v1, { align: "left" });
    put(ws, `M${r}:O${r}`, l2, { head: true, bold: true });
    put(ws, `P${r}:X${r}`, v2, { align: "left" });
    ws.getRow(r).height = Math.max(15, Math.max(lines(v1 ?? ""), lines(v2 ?? ""), lines(l2)) * 13 + 6);
  }
  put(ws, "A12:X12", "", { border: false });

  // 위험 유형 집계
  const agg = aggregate(f.steps);
  put(ws, "A13:C13", "위험 유형", { head: true, bold: true });
  put(ws, "D13:X13", "", { head: true });
  put(ws, "A14:C15", "유형", { head: true, bold: true });
  let col = 4;
  for (const g of HAZARD_GROUPS) {
    if (g.label === "기타 위험 유형") {
      put(ws, `U14:X15`, g.label, { head: true, bold: true });
      continue;
    }
    const start = ws.getCell(14, col).address;
    const end = ws.getCell(14, col + g.types.length - 1).address;
    put(ws, g.types.length > 1 ? `${start}:${end}` : start, g.label, { head: true, bold: true });
    g.types.forEach((t, i) => put(ws, ws.getCell(15, col + i).address, t, { head: true, size: 8 }));
    col += g.types.length;
  }
  put(ws, "A16:C16", "발생 건수", { head: true, bold: true });
  put(ws, "A17:C17", "최대위험도", { head: true, bold: true });
  HAZARD_TYPES.forEach((t, i) => {
    const isEtc = t === "기타";
    const c16 = isEtc ? "U16:X16" : ws.getCell(16, 4 + i).address;
    const c17 = isEtc ? "U17:X17" : ws.getCell(17, 4 + i).address;
    put(ws, c16, agg.count[t]);
    put(ws, c17, agg.max[t] || "", { bold: true });
    if (agg.max[t]) ws.getCell(c17.split(":")[0]).fill = { type: "pattern", pattern: "solid", fgColor: { argb: riskArgb(agg.max[t]) } };
  });
  ws.getCell("A18").value = "양식 CF112-02(갑), R02";
  ws.getCell("L18").value = "삼영순화주식회사";
  ws.getCell("U18").value = "A4(297X210)";
  for (const a of ["A18", "L18", "U18"]) ws.getCell(a).font = { ...FONT, size: 8 };
  ws.getRow(1).height = 20;
  ws.getRow(2).height = 14;
  ws.getRow(3).height = 14;
  for (const r of [5, 6, 7]) ws.getRow(r).height = 15;
}

function buildDetail(wb: Workbook, f: JsaForm) {
  const ws = wb.addWorksheet(SHEET2, { views: [{ showGridLines: false, state: "frozen", ySplit: 3 }], pageSetup: { ...pageSetup, fitToHeight: 0 } });
  const widths = [11, 26, 8, 6, 20, 11, 6, 26, 11, 10, 11, 6, 6, 6, 7, 9, 20, 7, 7, 10, 11, 6, 6, 6, 10];
  ws.columns = widths.map((width) => ({ width }));
  const H = { head: true, bold: true };
  put(ws, "A1:A3", "번호", H);
  put(ws, "B1:E2", "작업 내용", H);
  put(ws, "F1:H2", "유해위험요인(Hazards)", H);
  put(ws, "I1:K3", "현재안전조치", H);
  put(ws, "L1:N1", "통제 전 위험도 평가", H);
  put(ws, "O1:O3", "개선\n번호", H);
  put(ws, "P1:S3", "감소 대책(Control)", H);
  put(ws, "T1:T3", "개선\n목표일", H);
  put(ws, "U1:U3", "조치\n담당자", H);
  put(ws, "V1:X1", "통제 후 위험도 평가", H);
  put(ws, "Y1:Y3", "완료일", H);
  put(ws, "L2:L3", "빈도", H);
  put(ws, "M2:M3", "강도", H);
  put(ws, "N2:N3", "위험도", H);
  put(ws, "V2:V3", "빈도", H);
  put(ws, "W2:W3", "강도", H);
  put(ws, "X2:X3", "위험도", H);
  put(ws, "B3", "분류", H);
  put(ws, "C3:E3", "내용", H);
  put(ws, "F3", "유형", H);
  put(ws, "G3:H3", "내용", H);

  let r = 4;
  f.steps.forEach((s, i) => {
    const hz = s.hazards.length ? s.hazards : [{ type: "", content: "", freq: "", sev: "" }];
    const n = hz.length;
    const top = r;
    const bottom = r + n - 1;
    const span = (c: string) => (n > 1 ? `${c}${top}:${c}${bottom}` : `${c}${top}`);
    const spanCols = (a: string, b: string) => `${a}${top}:${b}${bottom}`;
    put(ws, span("A"), i + 1);
    put(ws, span("B"), s.cat);
    put(ws, spanCols("C", "E"), s.content, { align: "left" });
    put(ws, spanCols("I", "K"), s.safe, { align: "left" });
    const c = s.control;
    // 감소대책 : P 열 = 체크, Q:S = 설명 (원본은 P:S 에 섞여 있어 다시 불러올 때 설명이 사라졌음)
    put(ws, span("O"), c.needed ? c.impNo : "");
    put(ws, span("P"), c.needed ? CONTROL_OPTS.map((o) => `${c.checks.includes(o) ? "☑" : "□"} ${o}`).join("\n") : "", { align: "left" });
    put(ws, spanCols("Q", "S"), c.needed ? c.desc : "", { align: "left" });
    put(ws, span("T"), c.needed ? c.target : "");
    put(ws, span("U"), c.needed ? c.owner : "");
    const post = c.needed ? riskOf(c.postFreq, c.postSev) : null;
    put(ws, span("V"), c.needed && c.postFreq ? Number(c.postFreq) : "");
    put(ws, span("W"), c.needed && c.postSev ? Number(c.postSev) : "");
    put(ws, span("X"), post ?? "", { bold: true });
    if (post) ws.getCell(`X${top}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: riskArgb(post) } };
    put(ws, span("Y"), c.needed ? c.done : "");
    hz.forEach((h, j) => {
      const row = r + j;
      const risk = riskOf(h.freq, h.sev);
      put(ws, `F${row}`, h.type);
      put(ws, `G${row}:H${row}`, h.content, { align: "left" });
      put(ws, `L${row}`, h.freq ? Number(h.freq) : "");
      put(ws, `M${row}`, h.sev ? Number(h.sev) : "");
      put(ws, `N${row}`, risk ?? "", { bold: true });
      if (risk) ws.getCell(`N${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: riskArgb(risk) } };
      ws.getRow(row).height = Math.max(15, Math.max(lines(h.content), Math.ceil(Math.max(lines(s.content), lines(s.safe), c.needed ? 5 : 1) / n)) * 13 + 6);
    });
    r += n;
  });
  r += 1;
  ws.getCell(`A${r}`).value = "양식 CF112-02(을), R02";
  ws.getCell(`I${r}`).value = "삼영순화주식회사";
  ws.getCell(`X${r}`).value = "A4(297X210)";
  for (const a of [`A${r}`, `I${r}`, `X${r}`]) ws.getCell(a).font = { ...FONT, size: 8 };
}

// ---------------------------------------------------------------- 불러오기
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
const num = (s: string) => s.match(/[\d.]+/)?.[0] ?? "";
const date = (s: string) => {
  const m = s.match(/(20\d{2})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
};

export async function importJsaExcel(file: File, departments: DeptHead[]): Promise<{ form: JsaForm; note?: string }> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch (e) {
    throw new Error(`엑셀 파일을 읽는 중 오류가 발생했습니다: ${e instanceof Error ? e.message : String(e)}`);
  }
  const cover = wb.worksheets.find((w) => w.name.includes("갑"));
  const detail = wb.worksheets.find((w) => w.name.includes("을"));
  if (!cover || !detail) throw new Error("CF112-01(갑)/CF112-01(을) 시트를 찾을 수 없습니다. 원본 양식 파일인지 확인하세요.");

  const g = (a: string) => text(cover.getCell(a));
  const form = emptyJsa(date(g("P4")) || new Date().toISOString().slice(0, 10));
  const deptText = g("D4");
  const dept = departments.find((d) => d.name === deptText) ?? departments.find((d) => deptText && (deptText.includes(d.name) || d.name.includes(deptText)));
  let note: string | undefined;
  if (deptText && !dept) note = `부서 '${deptText}'를 찾지 못해 부서명은 직접 선택해 주세요.`;
  const nameNo = g("P8").match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  Object.assign(form, {
    department_id: dept?.id ?? "",
    super_name: g("F5"),
    worker_name: g("F6"),
    ehs_name: g("F7"),
    super_count: num(g("R5")),
    worker_count: num(g("R6")),
    ehs_count: num(g("R7")),
    work_area: g("D8"),
    work_name: nameNo ? nameNo[1] : g("P8"),
    work_no: nameNo ? nameNo[2] : "",
    sop_no: g("D9"),
    material: g("P9"),
    ppe: g("D10"),
    equip: g("P10"),
    safety_equip: g("D11"),
    req_docs: g("P11"),
  });

  // 을 : A 열 세로 병합 = 한 작업단계
  const masterRow = (r: number) => Number((detail.getCell(`A${r}`).master ?? detail.getCell(`A${r}`)).row);
  const blocks = new Map<number, number[]>();
  for (let r = 4; r <= detail.rowCount; r++) {
    const a = text(detail.getCell(`A${r}`));
    if (a === "번호" || /^양식/.test(a)) continue;
    const top = masterRow(r);
    const hasHazard = text(detail.getCell(`F${r}`)) || text(detail.getCell(`G${r}`));
    if (top !== r) blocks.get(top)?.push(r);
    else if (hasHazard || text(detail.getCell(`C${r}`))) blocks.set(r, [r]);
  }
  const d = (c: string, r: number) => text(detail.getCell(`${c}${r}`));
  const steps: JsaStep[] = [];
  for (const [top, rows] of [...blocks.entries()].sort((x, y) => x[0] - y[0])) {
    const hazards = rows
      .map((r) => ({ type: HAZARD_TYPES.includes(d("F", r)) ? d("F", r) : "", content: d("G", r), freq: num(d("L", r)), sev: num(d("M", r)) }))
      .filter((h, i) => i === 0 || h.type || h.content || h.freq || h.sev);
    const checkText = d("P", top);
    const checks = CONTROL_OPTS.filter((o) => new RegExp(`[☑✓Vv■].{0,2}${o}`).test(checkText));
    // 설명 : Q 열 (없으면 P 열에서 체크 줄을 뺀 나머지 — 원본 도구로 내보낸 파일 대응)
    const desc =
      d("Q", top) ||
      checkText
        .split("\n")
        .filter((l) => !CONTROL_OPTS.some((o) => new RegExp(`^\\s*[☑☐□✓Vv■]?\\s*${o}\\s*$`).test(l)))
        .join("\n")
        .trim();
    const control = {
      ...emptyControl(),
      checks: [...checks],
      desc,
      impNo: d("O", top),
      target: date(d("T", top)),
      owner: d("U", top),
      postFreq: num(d("V", top)),
      postSev: num(d("W", top)),
      done: date(d("Y", top)),
    };
    control.needed = !!(checks.length || desc || control.impNo || control.target || control.owner || control.postFreq);
    const step: JsaStep = { cat: d("B", top), content: d("C", top), safe: d("I", top), hazards: hazards.length ? hazards : [{ type: "", content: "", freq: "", sev: "" }], control };
    if (step.cat || step.content || step.safe || hazards.some((h) => h.type || h.content)) steps.push(step);
  }
  if (steps.length === 0) throw new Error("엑셀에서 작업단계 데이터를 찾지 못했습니다. 원본 CF112-02(을) 표 구조가 변경되지 않았는지 확인하세요.");
  form.steps = steps;
  return { form, note };
}
