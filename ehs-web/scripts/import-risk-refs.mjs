// 위험성평가 참고 자료 → risk_refs (AI 위험성평가 작성 · 유사 사례 찾기, 0047)
//
//   미리보기 : node scripts/import-risk-refs.mjs            (읽기만, 건수·실패 목록)
//   반영     : node scripts/import-risk-refs.mjs --apply    (risk_refs 를 전부 지우고 다시 넣은 뒤 검색 가중치 다시 계산)
//
//   자료 위치 : ../절차서_위험성평가/위험성평가 (저장소에 올리지 않는 폴더)
//     - 공장·팀별 폴더의 작업위험성평가서(JSA) 엑셀  → source 'jsa'  (우리 사업장)
//     - 참고자료/ 의 타사 작업표준·JSA 엑셀          → source 'ext'  (타사 참고 — 회사 이름은 넣지 않음)
//     - 한국산업안전보건공단 고위험요인(SIF) 아카이브 엑셀 → source 'sif'
//   개인정보 : 평가 참여자 · 담당자 · 결재자 이름은 읽지 않음 (작업명 · 장소 · 단계 · 위험 · 대책만)
//   여러 양식(R01 · R02 · R03 · 타사 JRA)은 머리글 글자(작업 내용/단계, 유해위험요인, 현재안전조치, 빈도, 강도, 감소대책)로 칸을 찾음
import ExcelJS from "exceljs";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const ROOT = new URL("../../절차서_위험성평가/위험성평가/", import.meta.url);
const ROOT_PATH = decodeURIComponent(ROOT.pathname).replace(/^\/([A-Za-z]:)/, "$1");

const t = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") return (v.richText ? v.richText.map((x) => x.text).join("") : (v.text ?? (v.result !== undefined ? String(v.result ?? "") : ""))).toString().trim();
  return String(v).trim();
};
const clean = (s) =>
  s
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
const norm = (s) => s.toLowerCase().replace(/[^0-9a-z가-힣]+/g, "");
const num = (s) => {
  const m = String(s).match(/\d+(\.\d+)?/);
  return m ? m[0] : "";
};
const HAZARD_TYPES = [
  "끼임",
  "베임/절단",
  "떨어짐",
  "맞음",
  "부딪힘",
  "넘어짐",
  "깔림/뒤집힘",
  "감전",
  "아크",
  "정전기",
  "화재/폭발",
  "누출",
  "소음",
  "질식",
  "근골격계",
  "한랭",
  "온열",
  "기타",
];
const LEGACY = { 협착: "끼임", 추락: "떨어짐", 낙하: "맞음", 충돌: "부딪힘", 전도: "깔림/뒤집힘" };
// 유형 칸이 없는 예전 양식 : 위험 글에서 유형 찾기 (R03 이름)
const TYPE_WORDS = [
  ["감전", /감전|충전부|누전|활선/],
  ["화재/폭발", /화재|폭발|인화|발화|점화|화염/],
  ["누출", /누출|비산|분출|유출|튐|접촉.*(약품|화학|산|알칼리)|화학물질/],
  ["질식", /질식|산소\s*결핍|유독가스|가스\s*중독|흡입/],
  ["떨어짐", /추락|떨어짐|떨어질|실족/],
  ["맞음", /낙하|맞음|맞을|날아|비래|떨어지는\s*물/],
  ["끼임", /끼임|끼일|협착|말림|감김/],
  ["베임/절단", /베임|절단|베일|찔림|찰과/],
  ["깔림/뒤집힘", /깔림|전도|뒤집|넘어지는\s*(장비|물체|중량)/],
  ["넘어짐", /넘어짐|넘어질|미끄러|걸려|전도\s*위험/],
  ["부딪힘", /부딪|충돌|부딫/],
  ["근골격계", /근골격|요통|중량물\s*취급|무리한\s*자세/],
  ["온열", /화상|고온|열사병|온열/],
  ["한랭", /동상|한랭|저온/],
  ["소음", /소음|난청/],
  ["정전기", /정전기/],
  ["아크", /아크/],
];
const guessType = (text) => TYPE_WORDS.find(([, re]) => re.test(text))?.[0] ?? "";
const EMPTY = /^[\s\-–·.ㆍ•]*$/;
// "-. 미끄럼 위험 / -. 추락 위험" 처럼 한 칸에 여러 위험 → 하나씩
const splitHazards = (text) =>
  text
    .split(/\n(?=\s*(?:[-–·•ㆍ]|\d+[.)]))/)
    .map((x) => x.replace(/^\s*(?:[-–·•ㆍ]+\.?|\d+[.)])\s*/, "").trim())
    .filter((x) => x && !EMPTY.test(x));
const hazType = (s) => {
  const v = (s || "").replace(/\s+/g, "");
  const n = LEGACY[v] ?? v;
  return HAZARD_TYPES.includes(n) ? n : "";
};

// ---------------------------------------------------------------- 엑셀 JSA 한 시트
function cellText(ws, r, c) {
  const cell = ws.getCell(r, c);
  return clean(t((cell.isMerged ? cell.master : cell).value));
}
function masterRow(ws, r, c) {
  const cell = ws.getCell(r, c);
  return cell.isMerged ? Number(cell.master.row) : r;
}
function findLabel(sheets, re) {
  // 표지 칸 : "작 업 명" 같은 이름 칸 오른쪽의 첫 값
  for (const ws of sheets) {
    for (let r = 1; r <= Math.min(ws.rowCount, 40); r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= Math.min(ws.columnCount, 40); c++) {
        const v = t(row.getCell(c).value).replace(/\s+/g, "");
        if (!v || !re.test(v) || v.length > 14) continue;
        const inline = t(row.getCell(c).value).split(/[:：]/)[1];
        if (inline && inline.trim()) return clean(inline);
        for (let k = c + 1; k <= Math.min(ws.columnCount, c + 14); k++) {
          const cell = row.getCell(k);
          if (cell.isMerged && cell.master.address === row.getCell(c).address) continue;
          const x = clean(t((cell.isMerged ? cell.master : cell).value));
          if (x && x.replace(/\s+/g, "") !== v) return x;
        }
      }
    }
  }
  return "";
}

function parseSheet(ws, metaSheets) {
  // 머리글 줄 : 작업 내용/단계 + 위험요인
  let hr = 0;
  const cols = {};
  for (let r = 1; r <= Math.min(ws.rowCount, 40) && !hr; r++) {
    const row = ws.getRow(r);
    const map = {};
    for (let c = 1; c <= Math.min(ws.columnCount, 45); c++) {
      const cell = row.getCell(c);
      if (cell.isMerged && cell.master !== cell) continue;
      const v = t(cell.value).replace(/\s+/g, "");
      if (!v) continue;
      if (/^(작업내용|작업단계|작업순서|세부작업내용|작업명\/작업내용)/.test(v) && !map.step) map.step = c;
      else if (/(유해위험요인|위험요인|잠재위험|Hazards)/i.test(v) && !map.hazard) map.hazard = c;
      else if (/^(현재안전조치|현재조치|현재조치사항)/.test(v)) map.current = c;
      else if (/^(감소대책|감소대책\(Control\)|개선대책)/.test(v.replace(/\(.*\)/, "")) || /^감소대책/.test(v)) map.control = c;
      else if (/^(위험유형|유형)$/.test(v)) map.type = c;
    }
    if (map.step && map.hazard) {
      hr = r;
      Object.assign(cols, map);
    }
  }
  if (!hr) return null;
  // 두 번째 머리글 줄 : 빈도 · 강도 (첫 묶음 = 통제 전, 둘째 = 통제 후) · 유형/내용
  const sub = ws.getRow(hr + 1);
  const freqs = [],
    sevs = [];
  for (let c = 1; c <= Math.min(ws.columnCount, 45); c++) {
    const v = t(sub.getCell(c).value).replace(/\s+/g, "");
    if (/^빈도/.test(v)) freqs.push(c);
    else if (/^(강도|중대성)/.test(v)) sevs.push(c);
    else if (/^유형$/.test(v) && !cols.type) cols.type = c;
  }
  const subRow = freqs.length || sevs.length ? 1 : 0;
  const start = hr + 1 + subRow;

  // 단계 : 작업 내용 칸이 세로로 합쳐진 줄 = 한 단계
  const steps = [];
  let cur = null;
  let blank = 0;
  for (let r = start; r <= ws.rowCount; r++) {
    const first = cellText(ws, r, 1);
    if (/^양식|^※|^작성|^검토|^승인/.test(first)) break;
    const step = cellText(ws, r, cols.step);
    const hz = cellText(ws, r, cols.hazard);
    const type = cols.type ? hazType(cellText(ws, r, cols.type)) : "";
    if (!step && !hz) {
      if (++blank > 5) break;
      continue;
    }
    blank = 0;
    // 머리글이 두 줄로 된 양식 : 아래 머리글 줄은 건너뜀
    if (/^(작업단계|작업내용|작업순서)$/.test(step.replace(/\s+/g, "")) && /^(유해)?위험요인/.test(hz.replace(/\s+/g, ""))) continue;
    const top = masterRow(ws, r, cols.step);
    if (!cur || (top === r && step)) {
      cur = {
        content: step,
        current: cols.current ? cellText(ws, r, cols.current) : "",
        control: cols.control ? cellText(ws, r, cols.control) : "",
        post: freqs[1] && sevs[1] ? { freq: num(cellText(ws, r, freqs[1])), sev: num(cellText(ws, r, sevs[1])) } : null,
        hazards: [],
      };
      steps.push(cur);
    }
    if ((hz && !EMPTY.test(hz)) || type) {
      const freq = freqs[0] ? num(cellText(ws, r, freqs[0])) : "";
      const sev = sevs[0] ? num(cellText(ws, r, sevs[0])) : "";
      const parts = type ? [hz.replace(/^\s*[-–·•ㆍ]+\.?\s*/, "")] : splitHazards(hz);
      for (const content of parts.length ? parts : [hz]) {
        const h = { type: type || guessType(content), content, freq, sev };
        if (!cur.hazards.some((x) => x.content === h.content && x.type === h.type)) cur.hazards.push(h);
      }
    }
  }
  for (const s of steps) {
    if (EMPTY.test(s.current)) s.current = "";
    if (EMPTY.test(s.content)) s.content = "";
  }
  const filled = steps.filter((s) => s.content || s.hazards.length);
  if (!filled.length) return null;
  // 감소대책 칸의 □ 제거 □ 대체 … 체크 줄은 빼고 설명만
  for (const s of filled)
    s.control = s.control
      .replace(/[□☐☑■✓]\s*(제거|대체|공학적|관리적|보호구)/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  const meta = {
    area: findLabel(metaSheets, /^(작업지역|작업장소|작업구역)/),
    ppe: findLabel(metaSheets, /^(필요한보호구|보호구)/),
    equip: findLabel(metaSheets, /^(필요한장비\/공구|장비\/공구|사용장비)/),
    safety_equip: findLabel(metaSheets, /^(필요한안전장비|안전장비)/),
    docs: findLabel(metaSheets, /^(필요한자료|필요서류)/),
  };
  const title = findLabel(metaSheets.concat(ws), /^(작업명|작업명\(번호\))/).replace(/\s*\([^()]*\)\s*$/, "");
  return { title, meta, steps: filled };
}

// ---------------------------------------------------------------- 파일 모으기
function walk(dir, out, skip) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (!skip.includes(n)) walk(p, out, skip);
    } else if (/\.(xlsx|xlsm)$/i.test(n) && !n.startsWith("~$") && !/고위험요인\(SIF\)/.test(n)) out.push(p);
  }
}

async function readJsaFiles(dir, source, skip) {
  const files = [];
  walk(dir, files, skip);
  const rows = [];
  const failed = [];
  for (const f of files) {
    const rel = relative(ROOT_PATH, f).replace(/\\/g, "/");
    let wb;
    try {
      wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(f);
    } catch (e) {
      failed.push(`${rel} : 읽기 실패 (${String(e.message).slice(0, 40)})`);
      continue;
    }
    const cover = wb.worksheets.filter((w) => /갑/.test(w.name));
    let n = 0;
    for (const ws of wb.worksheets) {
      let p;
      try {
        p = parseSheet(ws, cover.length ? [...cover, ws] : [ws]);
      } catch {
        p = null;
      }
      if (!p) continue;
      // 타사 "JSA 수행 전 작업순서" 양식(잠재위험 통제)은 빼고 본 JSA 만
      if (/수행\s*전/.test(ws.name) || /^잠재위험\s*통제$/.test(p.title)) continue;
      const fileTitle = rel
        .split("/")
        .pop()
        .replace(/\.(xlsx|xlsm)$/i, "")
        .replace(/^.*?\(JSA\)\s*/, "")
        .replace(/^\d+(-\d+)?\.?\s*/, "");
      const title = p.title && p.title.length > 2 ? p.title : ws.name.length > 3 && !/^(JSA|Sheet\d*|양식)/i.test(ws.name) ? ws.name : fileTitle;
      const year = Number(rel.match(/(20\d{2})/)?.[1]) || null;
      // 타사 시트 이름 끝의 "(작성자 이름)" 은 빼고 저장
      const sheet = source === "ext" ? ws.name.replace(/\s*\([가-힣]{3}\)\s*$/, "").trim() : ws.name;
      // 작업명 칸의 둘째 줄(문서번호 "HBC-C2 수시 26-017" 등)은 빼고 첫 줄만
      const name =
        clean(title)
          .split("\n")
          .find((x) => x.trim()) ?? "";
      rows.push({
        source,
        ref_key: `${rel}#${sheet}#${n}`,
        title: name.slice(0, 200),
        area: source === "jsa" ? p.meta.area || null : null,
        group_name: source === "jsa" ? rel.split("/")[0] : null,
        year,
        meta: { ...p.meta, file: rel, sheet },
        steps: p.steps,
      });
      n++;
    }
    if (!n) failed.push(`${rel} : JSA 표 없음`);
  }
  return { rows, failed, files: files.length };
}

async function readSif() {
  const f = readdirSync(ROOT_PATH).find((n) => /고위험요인\(SIF\).*\.xlsx$/.test(n));
  if (!f) return [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(join(ROOT_PATH, f));
  const rows = [];
  for (const ws of wb.worksheets) {
    if (!/아카이브/.test(ws.name)) continue;
    const construction = /건설/.test(ws.name);
    const head = ws.getRow(3).values.map((v) => t(v).replace(/\s+/g, ""));
    const col = (re) => head.findIndex((h) => re.test(h ?? ""));
    const c = { no: col(/^연번/), overview: col(/^재해개요/), origin: col(/^기인물/), factor: col(/^재해유발요인/), measure: col(/^위험성감소대책/), kind: col(/^재해종류/) };
    const sitCols = head.map((h, i) => (/^고위험작업/.test(h ?? "") ? i : -1)).filter((i) => i > 0);
    const indCols = head.map((h, i) => (/^산재업종/.test(h ?? "") ? i : -1)).filter((i) => i > 0);
    for (let r = 4; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const g = (i) => (i > 0 ? clean(t(row.getCell(i).value)) : "");
      const overview = g(c.overview);
      if (!overview) continue;
      // 건설업은 고위험작업이 세 칸(공종 › 작업 › 세부) — 앞 번호("13.4 ")는 빼고, 제목은 가장 자세한 칸
      const sits = sitCols
        .map(g)
        .filter(Boolean)
        .map((x) => x.replace(/^\d+(\.\d+)*\.?\s*/, ""));
      if (sits[0] === "공종") continue; // 건설업 시트의 두 번째 머리글 줄
      const situation = sits.join(" › ");
      const industry = indCols.map(g).filter(Boolean).join(" › ");
      rows.push({
        source: "sif",
        ref_key: `sif:${construction ? "c" : "m"}:${g(c.no)}`,
        title: (sits.at(-1) || overview).slice(0, 200),
        area: null,
        group_name: construction ? "건설업" : "제조업 등",
        year: Number(overview.match(/(20\d{2})년/)?.[1]) || null,
        meta: { no: g(c.no), industry, overview, origin: g(c.origin), situation, factor: g(c.factor), measure: g(c.measure), kind: g(c.kind) },
        steps: [],
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- 실행
const own = await readJsaFiles(ROOT_PATH, "jsa", ["참고자료"]);
const ext = await readJsaFiles(join(ROOT_PATH, "참고자료"), "ext", []);
const sif = await readSif();

// 같은 작업(작업명 + 단계 내용)이 여러 해 반복된 우리 JSA 는 최근 것 하나만, 반복 횟수는 meta.repeat
const byKey = new Map();
for (const r of own.rows) {
  const k = norm(r.title) + "|" + norm(r.steps.map((s) => s.content).join("")).slice(0, 200);
  const prev = byKey.get(k);
  if (!prev) byKey.set(k, { ...r, meta: { ...r.meta, repeat: 1 } });
  else {
    const keep = (r.year ?? 0) > (prev.year ?? 0) ? { ...r, meta: { ...r.meta } } : prev;
    keep.meta.repeat = (prev.meta.repeat ?? 1) + 1;
    byKey.set(k, keep);
  }
}
const ownRows = [...byKey.values()];
const all = [...ownRows, ...ext.rows, ...sif];

console.log(`우리 JSA : 파일 ${own.files}개 → 표 ${own.rows.length}개 → 같은 작업 묶어 ${ownRows.length}건 · 못 읽은 파일 ${own.failed.length}개`);
console.log(`타사 참고 : 파일 ${ext.files}개 → ${ext.rows.length}건 · 못 읽은 파일 ${ext.failed.length}개`);
console.log(`공단 SIF : ${sif.length}건`);
const sample = ownRows.find((r) => r.steps.length >= 3);
console.log("\n예시 :", JSON.stringify({ title: sample?.title, area: sample?.area, steps: sample?.steps.slice(0, 2) }, null, 1).slice(0, 1200));
writeFileSync(new URL("../.cache/risk-refs-failed.txt", import.meta.url), [...own.failed, ...ext.failed].join("\n"));
console.log("\n못 읽은 파일 목록 : ehs-web/.cache/risk-refs-failed.txt");

if (APPLY) {
  const env = Object.fromEntries(
    readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { error: dErr } = await db.from("risk_refs").delete().gte("id", 0);
  if (dErr) throw dErr;
  for (let i = 0; i < all.length; i += 200) {
    const { error } = await db.from("risk_refs").insert(all.slice(i, i + 200));
    if (error) throw new Error(`${i}번째 묶음 : ${error.message}`);
    process.stdout.write(`\r넣는 중 ${Math.min(i + 200, all.length)} / ${all.length}`);
  }
  const { error: gErr } = await db.rpc("rebuild_risk_ref_df");
  if (gErr) throw gErr;
  console.log("\n완료 : 검색 가중치 다시 계산");
} else {
  writeFileSync(new URL("../.cache/risk-refs.json", import.meta.url), JSON.stringify(all));
  console.log("\n미리보기만 했습니다 (자료 : ehs-web/.cache/risk-refs.json). 반영하려면 --apply");
}
