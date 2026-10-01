// 기존 엑셀(CEO/월간/공장장 안전점검 현황) → 시스템 이관
//
//   미리보기 : node scripts/import-legacy.mjs "../1. 2026_CEO 안전점검.xlsx" --admin 관리자이메일
//   실제 반영: 위 명령 + --apply
//   옵션     : --module insp_ceo|insp_monthly|insp_plant (기본 insp_ceo)  --site CA (기본)
//              --open-only        완료되지 않은 건만
//              --dept 부서명      담당부서 칸이 없는 양식(공장장·월간)의 조치 요청 부서
//              --allow-unmatched  담당자 이름을 사용자와 못 맞춘 건도 이관 (담당자 지정 대기로 들어감)
//
// 미리보기 결과는 엑셀 파일 옆에 "이관_미리보기_<파일명>.csv" 로 저장됩니다.
// 같은 파일을 여러 번 실행해도 이미 이관된 행(NO 기준)은 건너뜁니다.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

// ------------------------------------------------------------------ 인자
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && a.toLowerCase().endsWith(".xlsx"));
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const APPLY = args.includes("--apply");
const ALLOW_UNMATCHED = args.includes("--allow-unmatched");
const MODULE = opt("module", "insp_ceo");
const SITE_CODE = opt("site", "CA");
const ADMIN_EMAIL = opt("admin", "")?.toLowerCase();
const DEPT_DEFAULT = opt("dept", ""); // 담당부서 칸이 없는 양식(공장장·월간)일 때 조치 요청 부서
const OPEN_ONLY = args.includes("--open-only"); // 미완료 건만
if (!file) {
  console.error('사용법: node scripts/import-legacy.mjs "엑셀경로.xlsx" --admin 관리자이메일 [--apply]');
  process.exit(1);
}

// ------------------------------------------------------------------ 표기 통일 (엑셀 표기 → 시스템 장소명)
const LOCATION_ALIAS = {
  "HBC-C2 공장": "HBC-C2",
  "HBC-C2공장": "HBC-C2",
  "과수1공장": "과산화수소 1공장",
  "과수 1공장": "과산화수소 1공장",
  "과수1공장 / 실외저장탱크": "과산화수소 1공장",
  "과수2공장": "과산화수소 2공장",
  "과수 2공장": "과산화수소 2공장",
  "10동창고": "10동 창고",
  "야트트랙터": "야드 트랙터",
  "야드트랙터": "야드 트랙터",
  "과수 2공장": "과산화수소 2공장",
  "과산화수소 / 2공장": "과산화수소 2공장",
  "과산화수소 / 1공장": "과산화수소 1공장",
  "WLC-C1": "HBC-C1",
  "7동": "7동 창고",
  "폐기물처리장": "폐기물보관소",
  "폐기물 보관소": "폐기물보관소",
  "2사업장": "HBC-C3",
  "천안2사업장": "HBC-C3",
};
// 장소 칸에 세부장소에 해당하는 곳을 적은 경우 → [장소, 세부장소]
const PLACE_ALIAS = {
  "분석2실": ["분석실", "2분석실"],
  "분석1실": ["분석실", "1분석실"],
  "주차장": ["사업장 전체", "TC 주차장"],
  "TC 주차장": ["사업장 전체", "TC 주차장"],
  "T/C 주차장": ["사업장 전체", "TC 주차장"],
  "경비동": ["사업장 전체", "경비동"],
  "경비실 앞": ["사업장 전체", "경비동"],
  "정비물품저장소": ["사업장 전체", "정비물품저장소"],
  "공장 / 전체": ["사업장 전체", ""],
};
const EMPTY = new Set(["", "-", "–", "—", "x", "X"]);

// ------------------------------------------------------------------ 셀 읽기
function cellText(v) {
  if (v == null) return "";
  if (v instanceof Date) return ymd(v);
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return cellText(v.result);
    if (v.text) return String(v.text);
    return "";
  }
  return String(v);
}
const clean = (s) => s.replace(/\u200b/g, "").replace(/\r/g, "").replace(/^'/, "").trim();
const oneLine = (s) => clean(s).split(/\s*\n\s*/).filter(Boolean).join(" / ");
const val = (s) => (EMPTY.has(clean(s)) ? "" : clean(s));

function ymd(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function makeDate(y, m, d) {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || y < 2015 || y > 2040) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 27.04.31 → 04.30
  return ymd(new Date(Date.UTC(y, m - 1, Math.min(d, last))));
}
const serialToDate = (n) => ymd(new Date(Date.UTC(1899, 11, 30) + n * 86400000));

// 개선일정 문자열에서 날짜 추출 : 순서대로 [{date, afterArrow}]
function parseDates(raw) {
  if (raw instanceof Date) return [{ date: ymd(raw), afterArrow: false }];
  if (typeof raw === "number" && raw > 40000 && raw < 60000) return [{ date: serialToDate(raw), afterArrow: false }];
  const text = cellText(raw);
  const out = [];
  const re = /(→)?\s*(?:(20\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})|(?<![\d.])(\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})(?![\d]))/g;
  for (const m of text.matchAll(re)) {
    const d = m[2] ? makeDate(+m[2], +m[3], +m[4]) : makeDate(+m[5], +m[6], +m[7]);
    if (d) out.push({ date: d, afterArrow: Boolean(m[1]) || /→\s*$/.test(text.slice(0, m.index).trimEnd().slice(-2)) });
  }
  return out;
}

// 목표일 해석
//  - "1. … 2. …" 처럼 번호 항목이 여러 개면 항목별로 해석
//  - 항목 안에 → 가 있으면 마지막 날짜가 그 항목의 현재 목표, 앞 날짜들은 변경 이력
//  - → 가 없으면 항목 안에서 가장 늦은 날짜
//  - 현재 목표일 = 항목들 중 가장 늦은 목표 (그 항목의 이력을 사용)
function resolveSchedule(raw) {
  const items =
    raw instanceof Date || typeof raw === "number"
      ? [raw]
      : cellText(raw).split(/\n(?=\s*\d{1,2}[.)]\s)/).filter((s) => s.trim());
  let best = null;
  for (const item of items) {
    const ds = parseDates(item);
    if (ds.length === 0) continue;
    let chain;
    if (ds.some((d) => d.afterArrow)) {
      const seq = [ds[0].date, ...ds.slice(1).filter((d) => d.afterArrow).map((d) => d.date)];
      chain = seq.filter((d, i) => i === 0 || d !== seq[i - 1]);
    } else {
      chain = [ds.map((d) => d.date).sort().at(-1)];
    }
    if (!best || chain.at(-1) > best.at(-1)) best = chain;
  }
  if (!best) return null;
  return { original: best[0], current: best.at(-1), history: best.slice(1).map((d, i) => ({ old: best[i], new: d })) };
}

// 담당자 : "이정찬\n→\n박병군" → 현재 [박병군], 이전 [이정찬] / "1. 이우리\n2. 조성은" → [이우리, 조성은]
function parseAssignees(text) {
  const t = clean(text);
  if (!t) return { current: [], previous: [] };
  const split = (s) =>
    s.split(/[\n,/]| 및 /).map((x) => x.replace(/^\s*\d+[.)]\s*/, "").trim()).filter((x) => x && !EMPTY.has(x));
  if (t.includes("→")) {
    const parts = t.split("→");
    return { current: split(parts.at(-1)), previous: parts.slice(0, -1).flatMap(split) };
  }
  return { current: split(t), previous: [] };
}

function parseMonth(text) {
  const m = clean(text).match(/(\d{2,4})\s*년\s*(\d{1,2})\s*월/);
  if (!m) return null;
  const y = +m[1] < 100 ? 2000 + +m[1] : +m[1];
  return `${y}-${String(+m[2]).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ 엑셀 읽기
const xlsxPath = resolve(file);
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(xlsxPath);
const ws = wb.worksheets[0];

// 헤더 행 찾기 ("NO" / "문제점")
let headerRow = 0;
ws.eachRow((row, r) => {
  if (!headerRow && cellText(row.getCell(2).value).trim().toUpperCase() === "NO") headerRow = r;
});
if (!headerRow) throw new Error("헤더(NO) 행을 찾지 못했습니다.");

// 열 위치는 헤더 이름으로 찾는다 : CEO·프로그램 다운로드 양식(개선 계획 즉시/단기/장기 3칸)과
// 공장장·월간 양식(대책유형 + 개선방안 1칸, 담당부서 칸 없음)을 모두 읽음
const H = {};
const headCols = [];
ws.getRow(headerRow).eachCell((cell, i) => {
  const h = cellText(cell.value).replace(/\s+/g, "");
  if (!h) return;
  headCols.push(i);
  const set = (k) => (H[k] ??= i);
  if (h === "NO") set("no");
  else if (/^(시행월|점검일자|일자)$/.test(h) || /^\d{2}\.\d{2}\.\d{2}$/.test(h)) set("month");
  else if (h === "점검자") set("inspector");
  else if (h === "장소") set("loc");
  else if (h === "세부장소") set("sub");
  else if (h === "유형") set("type");
  else if (h.startsWith("문제점")) set("problem");
  else if (h.startsWith("개선전")) set("before");
  else if (h.startsWith("대책유형")) set("kind");
  else if (h === "개선계획" || h.startsWith("개선방안") || h === "개선대책") set("plan");
  else if (h.startsWith("개선일정")) set("schedule");
  else if (h.startsWith("개선후")) set("after");
  else if (h === "담당부서") set("dept");
  else if (h === "담당자") set("assignee");
  else if (h.startsWith("완료여부")) set("done");
  else if (h.startsWith("미완료")) set("progress");
});
headCols.sort((a, b) => a - b);
const spanEnd = (col) => (headCols.find((c) => c > col) ?? col + 1) - 1; // 합쳐진 헤더의 마지막 열
for (const k of ["no", "month", "loc", "problem", "before"]) if (!H[k]) throw new Error(`헤더 '${k}' 열을 찾지 못했습니다.`);
const threePlans = !H.kind; // CEO·다운로드 양식 : 개선 계획 아래 즉시/단기/장기 하위 헤더
const firstDataRow = threePlans ? headerRow + 2 : headerRow + 1;
const KIND_OF = (t) => (/즉시/.test(t) ? "immediate" : /장기/.test(t) ? "long" : "short");

// 사진 → 행 매핑 (사진 윗변이 행 높이의 60% 아래에서 시작하면 다음 행으로 간주)
const rowHeightPt = (r) => ws.getRow(r).height ?? 15;
const photos = new Map(); // excelRow → {before: [], after: [], skipped: []}
const skippedImages = [];
for (const im of ws.getImages()) {
  const tl = im.range.tl;
  let row = Math.floor(tl.nativeRow) + 1;
  const offPt = (tl.nativeRowOff ?? 0) / 12700;
  if (offPt > rowHeightPt(row) * 0.6) row += 1;
  const col = Math.floor(tl.nativeCol); // 0 기준
  const c1 = col + 1;
  const media = wb.model.media[Number(im.imageId)];
  const entry = photos.get(row) ?? { before: [], after: [] };
  if (!media || !["png", "jpeg", "jpg"].includes(media.extension)) {
    skippedImages.push(`${row}행 ${String.fromCharCode(65 + col)}열 (${media?.extension ?? "?"} 형식 미지원)`);
    continue;
  }
  // 사진이 칸 경계를 살짝 넘는 경우를 감안해 앞뒤 1열까지
  if (c1 >= H.before - 1 && c1 <= spanEnd(H.before) + 1 && c1 !== H.after - 1) entry.before.push(media);
  else if (H.after && c1 >= H.after - 1 && c1 <= spanEnd(H.after) + 1) entry.after.push(media);
  else {
    skippedImages.push(`${row}행 ${String.fromCharCode(65 + col)}열 (개선 전/후 칸 밖의 이미지)`);
    continue;
  }
  photos.set(row, entry);
}

const rows = [];
const TYPE_ALIAS = { 계측기: "설비" };
const DEPT_ALIAS = { 품질팀: "품질보증팀", 경영지원실: "총무팀", 생산그룹: "생산팀", EHS부서: "EHS팀", EHS: "EHS팀" };
let lastMonth = null; // 시행 월이 비어 있으면 위 행의 월 (합쳐진 칸·생략)
let lastInspector = "";
for (let r = firstDataRow; r <= ws.rowCount; r++) {
  const row = ws.getRow(r);
  const c = (col) => (col ? row.getCell(col).value : null);
  const no = Number(cellText(c(H.no)));
  if (!no) continue;
  // 번호만 매겨 둔 빈 양식 행은 건너뜀
  if (!clean(cellText(c(H.problem))) && !photos.get(r)?.before.length) continue;
  const monthCell = c(H.month);
  const planText = threePlans ? "" : val(cellText(c(H.plan)));
  const measures = threePlans
    ? { immediate: val(cellText(c(H.plan))), short: val(cellText(c(H.plan + 1))), long: val(cellText(c(H.plan + 2))) }
    : { immediate: "", short: "", long: "", ...(planText ? { [KIND_OF(cellText(c(H.kind)))]: planText } : {}) };
  rows.push({
    excelRow: r,
    no,
    monthRaw: clean(cellText(monthCell)),
    month: (lastMonth = (monthCell instanceof Date ? ymd(monthCell).slice(0, 7) : parseMonth(cellText(monthCell)) ?? parseDates(monthCell)[0]?.date.slice(0, 7)) ?? lastMonth),
    carried: cellText(monthCell).includes("이월"),
    inspector: (lastInspector = val(cellText(c(H.inspector))) || lastInspector),
    locationRaw: oneLine(cellText(c(H.loc))),
    subRaw: val(oneLine(cellText(c(H.sub)))),
    type: val(cellText(c(H.type))),
    problem: clean(cellText(c(H.problem))),
    measures,
    scheduleRaw: clean(cellText(c(H.schedule))),
    schedule: H.schedule ? resolveSchedule(c(H.schedule)) : null,
    afterNote: threePlans && H.after ? clean(cellText(c(H.after))) : "",
    department: DEPT_ALIAS[val(cellText(c(H.dept)))] ?? (val(cellText(c(H.dept))) || DEPT_DEFAULT),
    assignees: parseAssignees(cellText(c(H.assignee))),
    done: clean(cellText(c(H.done))) === "완료",
    progress: val(cellText(c(H.progress))),
    directive: threePlans ? val(cellText(c(18))) : "",
    photos: photos.get(r) ?? { before: [], after: [] },
  });
}

// ------------------------------------------------------------------ DB 연결 (있으면 매칭 검증)
const envPath = new URL("../.env.local", import.meta.url);
const env = existsSync(envPath)
  ? Object.fromEntries(
      readFileSync(envPath, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
    )
  : {};
const db = env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;
if (APPLY && !db) throw new Error(".env.local 의 Supabase 설정이 필요합니다.");

let ctx = null;
if (db) {
  const must = (r) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  const site = must(await db.from("sites").select("id").eq("code", SITE_CODE).single());
  const mod = must(await db.from("modules").select("code, name").eq("code", MODULE).single());
  ctx = {
    site,
    mod,
    locations: must(await db.from("locations").select("id, name, sub_locations(id, name)").eq("site_id", site.id)),
    types: must(await db.from("finding_types").select("id, name")),
    depts: must(await db.from("departments").select("id, name, parent_id").eq("site_id", site.id)),
    people: must(await db.from("profiles").select("id, name, department_id, email").eq("is_active", true)),
    admin: ADMIN_EMAIL ? must(await db.from("profiles").select("id, name").eq("email", ADMIN_EMAIL).maybeSingle()) : null,
    existing: new Set(must(await db.from("findings").select("legacy_ref").not("legacy_ref", "is", null)).map((x) => x.legacy_ref)),
  };
  if (APPLY && !ctx.admin) throw new Error(`--admin ${ADMIN_EMAIL || "(미입력)"} 사용자를 찾지 못했습니다.`);
}

const norm = (s) => s.replace(/\s+/g, "").toLowerCase();
// 같은 파일에 NO 가 두 번 나오면 두 번째부터 행 번호를 붙여 구분
const refOf = (r) => `xlsx:${basename(xlsxPath)}:${r.no}${rows.findIndex((x) => x.no === r.no) !== rows.indexOf(r) ? `#${r.excelRow}` : ""}`;
const today = ymd(new Date(Date.now() + 9 * 3600000));

// 행별 매핑 결과
const team = (deptId) => ctx?.depts.find((d) => d.id === deptId)?.parent_id ?? deptId; // 파트 → 상위 부서
const plans = rows.filter((r) => !OPEN_ONLY || !r.done).map((r) => {
  // 장소 이름 맞추기 : 별칭 → "장소 / 세부" 로 적힌 칸은 앞부분을 장소로, 나머지는 세부장소 앞에 붙임
  let locName = LOCATION_ALIAS[r.locationRaw] ?? (r.locationRaw || "사업장 전체"); // 장소를 비워 둔 행은 사업장 전체
  if (PLACE_ALIAS[r.locationRaw]) {
    const [l, s] = PLACE_ALIAS[r.locationRaw];
    locName = l;
    if (s) r.subRaw = r.subRaw ? `${s} ${r.subRaw}` : s;
  } else if (!ctx?.locations.some((l) => norm(l.name) === norm(locName)) && locName.includes(" / ")) {
    const [head, ...rest] = locName.split(" / ");
    const headName = LOCATION_ALIAS[head] ?? head;
    if (ctx?.locations.some((l) => norm(l.name) === norm(headName))) {
      locName = headName;
      r.subRaw = [rest.join(" "), r.subRaw].filter(Boolean).join(" ");
    }
  }
  const loc = ctx?.locations.find((l) => norm(l.name) === norm(locName));
  const sub = loc?.sub_locations.find((s) => norm(s.name) === norm(r.subRaw));
  const type = ctx?.types.find((t) => t.name === (TYPE_ALIAS[r.type] ?? r.type));
  const dept = ctx?.depts.find((d) => !d.parent_id && norm(d.name) === norm(r.department));

  const matched = [];
  const unmatched = [];
  for (const name of r.assignees.current) {
    const cands = (ctx?.people ?? []).filter((p) => p.name === name);
    const p = cands.find((x) => team(x.department_id) === dept?.id) ?? (cands.length === 1 ? cands[0] : null);
    if (p && team(p.department_id) === dept?.id) matched.push(p);
    else unmatched.push(name + (p ? "(타 부서)" : ""));
  }

  const kinds = Object.entries(r.measures).filter(([, v]) => v);
  let schedule = r.schedule;
  let scheduleNote = "";
  if (!schedule && kinds.length) {
    const fallback = r.done ? `${r.month ?? today.slice(0, 7)}-28` : ymd(new Date(Date.parse(today) + 30 * 86400000));
    schedule = { original: fallback, current: fallback, history: [] };
    scheduleNote = "목표일 미기재 → 임의 지정";
  }

  const status = r.done
    ? "closed"
    : matched.length === 0
      ? "assign_wait"
      : kinds.length
        ? "in_progress"
        : "plan_wait";

  return { r, loc, sub, type, dept, matched, unmatched, kinds, schedule, scheduleNote, status };
});

// ------------------------------------------------------------------ 미리보기 출력
const STATUS_KO = { closed: "종결", in_progress: "조치 중", plan_wait: "계획 수립 대기", assign_wait: "담당자 지정 대기" };
const csvCell = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
const header = ["NO", "시행 월", "장소(엑셀)", "장소(시스템)", "세부장소", "유형", "부서", "담당자", "담당자 매칭", "조치", "최초 목표일", "현재 목표일", "일정 변경", "상태", "개선 전 사진", "개선 후 사진", "지시사항", "확인 필요"];
const lines = plans.map((p) => [
  p.r.no,
  p.r.month + (p.r.carried ? " (이월)" : ""),
  p.r.locationRaw,
  p.loc?.name ?? LOCATION_ALIAS[p.r.locationRaw] ?? p.r.locationRaw,
  p.sub?.name ?? (p.r.subRaw ? `${p.r.subRaw}${ctx ? " (직접입력)" : ""}` : ""),
  p.r.type,
  p.r.department,
  p.r.assignees.current.join(", ") + (p.r.assignees.previous.length ? ` (이전: ${p.r.assignees.previous.join(", ")})` : ""),
  ctx ? (p.unmatched.length ? `미매칭: ${p.unmatched.join(", ")}` : "OK") : "(DB 미연결)",
  p.kinds.map(([k]) => ({ immediate: "즉시", short: "단기", long: "장기" })[k]).join("/"),
  p.schedule?.original ?? "",
  p.schedule?.current ?? "",
  p.schedule?.history.length ?? 0,
  STATUS_KO[p.status],
  p.r.photos.before.length,
  p.r.photos.after.length,
  p.r.directive ? "있음" : "",
  [...(p.scheduleNote ? [p.scheduleNote] : []), ...plansIssues(p)].join(" / "),
]);
function plansIssues(p) {
  const out = [];
  const locName = LOCATION_ALIAS[p.r.locationRaw] ?? p.r.locationRaw;
  if (!ctx && !["HBC-C1", "HBC-C2", "과산화수소 1공장", "과산화수소 2공장", "연구소", "분석실", "TC 점검소", "10동 창고", "야드트랙터", "보행로", "사업장 전체"].includes(locName))
    out.push(`장소 '${p.r.locationRaw}' 확인`);
  if (!p.r.month) out.push("시행 월 해석 불가");
  if (!p.r.done && !p.kinds.length) out.push("조치계획 없음");
  if (ctx) {
    if (!p.loc) out.push("장소 없음");
    if (!p.dept) out.push("부서 없음");
    if (p.r.type && !p.type) out.push("유형 없음");
    if (ctx.existing.has(refOf(p.r))) out.push("이미 이관됨");
  }
  return out;
}
const csvPath = join(dirname(xlsxPath), `이관_미리보기_${basename(xlsxPath, ".xlsx")}.csv`);
writeFileSync(csvPath, "﻿" + [header, ...lines].map((l) => l.map(csvCell).join(",")).join("\r\n"));

const count = (fn) => plans.filter(fn).length;
console.log(`\n■ ${basename(xlsxPath)} : ${plans.length}건`);
console.log(`  상태: 종결 ${count((p) => p.status === "closed")} · 조치 중 ${count((p) => p.status === "in_progress")} · 계획 대기 ${count((p) => p.status === "plan_wait")} · 담당자 지정 대기 ${count((p) => p.status === "assign_wait")}`);
console.log(`  사진: 개선 전 ${plans.reduce((a, p) => a + p.r.photos.before.length, 0)}장 · 개선 후 ${plans.reduce((a, p) => a + p.r.photos.after.length, 0)}장`);
console.log(`  목표일 변경 이력: ${plans.reduce((a, p) => a + (p.schedule?.history.length ?? 0), 0)}건 · 지시사항 ${count((p) => p.r.directive)}건`);
if (skippedImages.length) console.log(`  제외 이미지: ${skippedImages.join(", ")}`);
const unmatchedAll = [...new Set(plans.flatMap((p) => p.unmatched))];
const unmatchedOpen = [...new Set(plans.filter((p) => !p.r.done).flatMap((p) => p.unmatched))];
if (ctx && unmatchedAll.length) {
  console.log(`  ⚠ 사용자와 매칭되지 않은 담당자 ${unmatchedAll.length}명: ${unmatchedAll.join(", ")}`);
  console.log(`    그중 미종결 건 담당자 ${unmatchedOpen.length}명: ${unmatchedOpen.join(", ") || "없음"} (종결 건은 이름만 이력에 기록)`);
}
if (!ctx) console.log("  (DB 미연결 : 담당자·장소 매칭은 .env.local 설정 후 다시 확인됩니다)");
console.log(`  미리보기 저장: ${csvPath}`);

if (!APPLY) {
  console.log("\n미리보기만 실행했습니다. 실제 반영은 --apply 를 붙여 다시 실행하세요.");
  process.exit(0);
}

// ------------------------------------------------------------------ 반영
const blocking = plans.filter((p) => !ctx.existing.has(refOf(p.r)) && (!p.loc || !p.dept || !p.r.month));
if (blocking.length) {
  console.error(`\n장소/부서/시행 월을 확인할 수 없는 행이 있어 중단합니다: NO ${blocking.map((p) => p.r.no).join(", ")}`);
  process.exit(1);
}
if (unmatchedOpen.length && !ALLOW_UNMATCHED) {
  console.error("\n미종결 건에 매칭되지 않은 담당자가 있어 중단합니다. 사용자를 먼저 등록하거나 --allow-unmatched 를 붙이세요 (해당 건은 담당자 지정 대기로 들어갑니다).");
  process.exit(1);
}

const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};
const adminId = ctx.admin.id;
const inspectionIds = new Map();
// 점검자 : CEO = 대표이사, 공장장 = 공장장, 월간 = 엑셀의 점검자 칸 (월 + 점검자별로 회차)
const inspectorOf = (r) => (MODULE === "insp_ceo" ? "대표이사" : MODULE === "insp_plant" ? "공장장" : r.inspector || null);
async function inspectionFor(month, inspector) {
  const key = `${month}|${inspector ?? ""}`;
  if (inspectionIds.has(key)) return inspectionIds.get(key);
  const [y, m] = month.split("-");
  const title = `${y}년 ${Number(m)}월 ${ctx.mod.name}${MODULE === "insp_monthly" && inspector ? ` (${inspector})` : ""}`;
  const found = must(
    await db.from("inspections").select("id").eq("module_code", MODULE).eq("site_id", ctx.site.id).eq("title", title).limit(1).maybeSingle(),
    "점검 조회",
  );
  const id =
    found?.id ??
    must(
      await db
        .from("inspections")
        .insert({ site_id: ctx.site.id, module_code: MODULE, inspection_date: `${month}-01`, title, inspector, note: `엑셀 이관 (${basename(xlsxPath)})`, created_by: adminId })
        .select("id")
        .single(),
      "점검 등록",
    ).id;
  inspectionIds.set(key, id);
  return id;
}

// 원본(1600px) + 목록용 썸네일(360px, 같은 이름 + .thumb.jpg) — 앱의 사진 저장 규칙과 동일
async function uploadPhoto(fid, kind, media, i) {
  const src = sharp(Buffer.from(media.buffer)).rotate().flatten({ background: "#ffffff" });
  const size = (side, quality) =>
    src.clone().resize({ width: side, height: side, fit: "inside", withoutEnlargement: true }).jpeg({ quality }).toBuffer();
  const path = `${fid}/${kind}-legacy-${i}.jpg`;
  for (const [target, buf] of [[path, await size(1600, 80)], [path.replace(/\.jpg$/, ".thumb.jpg"), await size(360, 70)]]) {
    must(await db.storage.from("findings").upload(target, buf, { contentType: "image/jpeg", upsert: true }), "사진 업로드");
  }
  return path;
}

let imported = 0;
for (const p of plans) {
  const ref = refOf(p.r);
  if (ctx.existing.has(ref)) continue;
  const fid = randomUUID();
  const uploaded = [];
  try {
    const inspectionId = await inspectionFor(p.r.month, inspectorOf(p.r));
    const { data: last } = await db.from("findings").select("seq").eq("inspection_id", inspectionId).order("seq", { ascending: false }).limit(1);
    const seq = (last?.[0]?.seq ?? 0) + 1;
    const doneDate = p.schedule ? (p.schedule.current < today ? p.schedule.current : today) : today;

    must(
      await db.from("findings").insert({
        id: fid,
        inspection_id: inspectionId,
        site_id: ctx.site.id,
        module_code: MODULE,
        seq,
        location_id: p.loc.id,
        sub_location_id: p.sub?.id ?? null,
        sub_location_text: p.sub ? null : p.r.subRaw || null,
        finding_type_id: p.type?.id ?? null,
        problem: p.r.problem || "(내용 없음)",
        request_department_id: p.dept.id,
        status: p.status,
        created_by: adminId,
        created_at: `${p.r.month}-01T09:00:00+09:00`,
        completed_at: p.status === "closed" ? `${doneDate}T18:00:00+09:00` : null,
        closed_at: p.status === "closed" ? `${doneDate}T18:00:00+09:00` : null,
        closed_by: p.status === "closed" ? adminId : null,
        legacy_ref: ref,
      }),
      "지적사항 등록",
    );

    if (p.status !== "assign_wait" && p.matched.length)
      must(await db.from("finding_assignees").insert(p.matched.map((m) => ({ finding_id: fid, user_id: m.id, assigned_by: adminId }))), "담당자");

    for (const [kind, content] of p.kinds) {
      const measure = must(
        await db
          .from("finding_measures")
          .insert({
            finding_id: fid,
            kind,
            content,
            target_date: p.schedule.current,
            original_target_date: p.schedule.original,
            reschedule_count: p.schedule.history.length,
            is_done: p.r.done,
            done_at: p.r.done ? doneDate : null,
          })
          .select("id")
          .single(),
        "조치계획",
      );
      if (p.schedule.history.length)
        must(
          await db.from("measure_date_history").insert(
            p.schedule.history.map((h) => ({ measure_id: measure.id, old_date: h.old, new_date: h.new, reason: "엑셀 이관 (기존 일정 변경)", changed_by: adminId })),
          ),
          "일정 이력",
        );
    }

    for (const [kind, list] of [["before", p.r.photos.before], ["after", p.r.photos.after]]) {
      for (const [i, media] of list.entries()) {
        const path = await uploadPhoto(fid, kind, media, i);
        uploaded.push(path);
        must(await db.from("finding_photos").insert({ finding_id: fid, kind, path, created_by: adminId }), "사진 등록");
      }
    }

    const progressText = [p.r.progress, p.r.afterNote && `[개선 후 비고] ${p.r.afterNote}`].filter(Boolean).join("\n\n");
    if (progressText)
      must(await db.from("finding_progress").insert({ finding_id: fid, reason: "기존 엑셀 기록", progress: progressText, created_by: adminId }), "진행현황");

    if (p.r.directive)
      must(await db.from("finding_comments").insert({ finding_id: fid, user_id: adminId, is_directive: true, body: p.r.directive }), "지시사항");

    const note = [
      `${basename(xlsxPath)} NO.${p.r.no}${p.r.carried ? " (이월)" : ""}`,
      p.r.assignees.previous.length && `이전 담당자: ${p.r.assignees.previous.join(", ")}`,
      p.unmatched.length && `미매칭 담당자: ${p.unmatched.join(", ")}`,
      p.r.scheduleRaw && `기존 개선일정: ${p.r.scheduleRaw.replace(/\n/g, " ")}`,
      p.scheduleNote,
    ]
      .filter(Boolean)
      .join("\n");
    must(await db.from("finding_events").insert({ finding_id: fid, actor_id: adminId, action: "이관", detail: note }), "이력");

    // 이관 중 생긴 알림(지시사항 등)은 발송하지 않음
    await db.from("notifications").delete().eq("finding_id", fid);
    imported++;
    process.stdout.write(`\r  반영 중… ${imported}건`);
  } catch (e) {
    console.error(`\n  ✗ NO.${p.r.no} 실패: ${e.message} → 해당 건 되돌림`);
    await db.from("findings").delete().eq("id", fid);
    if (uploaded.length) await db.storage.from("findings").remove([...uploaded, ...uploaded.map((x) => x.replace(/\.jpg$/, ".thumb.jpg"))]);
  }
}
console.log(`\n\n완료: ${imported}건 이관`);
