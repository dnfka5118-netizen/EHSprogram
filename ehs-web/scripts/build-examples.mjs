// 과거 점검 엑셀 → "비슷한 과거 지적" 추천용 사례 만들기 (사진 특징값 + 유형 + 문제점)
//
//   미리보기 : node scripts/build-examples.mjs "../점검 DB"            → 건수·이름 제거 결과만 확인
//   DB 반영  : node scripts/build-examples.mjs "../점검 DB" --apply    → finding_examples 를 새로 채움 (기존 사례는 지움)
//   암호 엑셀 : 암호를 푼 사본 폴더를 함께 준다 → node scripts/build-examples.mjs "../점검 DB" ".cache/decrypted" --apply
//
// - 사진은 DB 에 올리지 않는다. 사진에서 뽑은 512개 숫자(특징값)만 저장한다.
// - 문제점 문구에서 사람 이름(사용자 목록 + 엑셀 담당자·점검자 칸 + "OOO 대리" 형태)을 지운다.
// - 브라우저(lib/similar.ts)와 같은 모델·같은 전처리로 계산해야 서로 비교할 수 있다.
// - 암호(DRM)가 걸린 엑셀은 읽을 수 없으므로 건너뛰고 목록을 알려 준다.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import ExcelJS from "exceljs";
import sharp from "sharp";
import * as ort from "onnxruntime-web";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
// 폴더를 여러 개 줄 수 있음 (예: 원본 폴더 + 암호를 푼 사본 폴더 .cache/decrypted)
const ROOTS = args.filter((a) => !a.startsWith("--"));
if (ROOTS.length === 0) ROOTS.push("../점검 DB");
const ROOT = ROOTS[0];
const APPLY = args.includes("--apply");
const AUDIT = args.includes("--audit"); // 지운 낱말만 확인하고 끝냄 (.cache/scrub-audit.json)
const EXTRA = ["../1. 2026_CEO 안전점검.xlsx"]; // 암호 없는 사본 (점검 DB 안의 원본은 암호가 걸려 있음)

export const MODEL_URL = "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model_quantized.onnx";
const MEAN = [0.48145466, 0.4578275, 0.40821073];
const STD = [0.26862954, 0.26130258, 0.27577711];

// ------------------------------------------------------------------ 환경
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ------------------------------------------------------------------ 엑셀 읽기
const text = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return "";
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return text(v.result);
    if (v.text) return String(v.text);
    return "";
  }
  return String(v);
};
const norm = (s) => s.replace(/\s+/g, "");

const files = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.xlsx$/i.test(n) && !n.startsWith("~$")) files.push(p);
  }
};
for (const r of ROOTS) walk(r);
const rel = (f) => relative(ROOTS.find((r) => !relative(r, f).startsWith("..")) ?? ROOT, f);
for (const f of EXTRA) if (existsSync(f)) files.push(f);

// 담당자·점검자 칸의 낱말은 "흔한 성씨 + 두 글자" 일 때만 이름으로 본다 (칸에 "필요", "요청" 같은 글도 섞여 있음)
const SURNAME = "김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉경사부가복태목형피두감음빈동온호좌";
const looksName = (w) => w.length === 3 && SURNAME.includes(w[0]);
const locked = [];
const records = [];
const nameWords = new Set();

for (const file of files) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(file);
  } catch {
    locked.push(rel(file));
    continue;
  }
  for (const ws of wb.worksheets) {
    // 머리글 행 (문제점 칸이 있는 첫 행)
    let hr = 0;
    const col = {};
    for (let r = 1; r <= Math.min(12, ws.rowCount) && !hr; r++) {
      const cells = [];
      ws.getRow(r).eachCell((c, i) => cells.push([i, norm(text(c.value))]));
      if (!cells.some(([, v]) => v.startsWith("문제점"))) continue;
      hr = r;
      for (const [i, v] of cells) {
        if (v === "장소") col.loc = i;
        else if (v === "세부장소") col.sub = i;
        else if (v === "유형") col.type = i;
        else if (v.startsWith("문제점")) col.problem = i;
        else if (v.startsWith("개선전")) col.photo = i;
        else if (v === "담당자" || v === "점검자") (col.people ??= []).push(i);
      }
      const heads = cells.map(([i]) => i).sort((a, b) => a - b);
      col.photoEnd = (heads.find((i) => i > col.photo) ?? col.photo + 1) - 1; // 개선 전 사진 칸이 여러 열로 합쳐진 경우
    }
    if (!hr || !col.problem || !col.photo) continue;

    // 사진 → 행
    const media = wb.model.media;
    const firstPhoto = new Map();
    for (const im of ws.getImages()) {
      const tl = im.range.tl;
      const c1 = Math.floor(tl.nativeCol) + 1;
      if (c1 < col.photo || c1 > col.photoEnd) continue;
      let row = Math.floor(tl.nativeRow) + 1;
      const h = ws.getRow(row).height ?? 15;
      if ((tl.nativeRowOff ?? 0) / 12700 > h * 0.6) row += 1;
      const m = media[Number(im.imageId)];
      if (!m || !["png", "jpeg", "jpg"].includes(m.extension)) continue;
      if (!firstPhoto.has(row)) firstPhoto.set(row, m.buffer);
    }

    // 지적사항 행 (사진이 합쳐진 행 아래로 걸친 경우 가장 가까운 위쪽 지적사항 행에 붙임)
    const rows = [];
    for (let r = hr + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      for (const i of col.people ?? []) for (const w of text(row.getCell(i).value).split(/[\s,/·()]+/)) if (/^[가-힣]{3}$/.test(w) && looksName(w)) nameWords.add(w);
      const problem = text(row.getCell(col.problem).value).trim();
      if (problem.length < 3) continue;
      rows.push({
        r,
        source: `${rel(file)} #${ws.name}`,
        location: col.loc ? text(row.getCell(col.loc).value).trim() : "",
        sub: col.sub ? text(row.getCell(col.sub).value).trim() : "",
        type: col.type ? text(row.getCell(col.type).value).trim() : "",
        problem,
      });
    }
    for (const [pr, buf] of firstPhoto) {
      const owner = [...rows].reverse().find((x) => x.r <= pr);
      if (owner && !owner.photo) owner.photo = buf;
    }
    records.push(...rows.filter((x) => x.photo));
  }
}

// ------------------------------------------------------------------ 이름 지우기
const { data: profs } = await db.from("profiles").select("name");
for (const p of profs ?? []) if (/^[가-힣]{2,4}$/.test(p.name)) nameWords.add(p.name);
// 사용자 목록·담당자 칸에 없는 이름은 .cache/extra-names.txt 에 한 줄에 하나씩 (저장소에 올리지 않음)
const extraNames = new URL("../.cache/extra-names.txt", import.meta.url);
if (existsSync(extraNames)) for (const n of readFileSync(extraNames, "utf8").split(/\r?\n/)) if (n.trim()) nameWords.add(n.trim());
const STOP = new Set(["담당자", "부서", "관리자", "작업자", "점검자", "해당자", "전원", "각부서", "해당부서", "담당부서", "전직원", "협력사"]);
// 이름이 아닌 낱말은 제외 (부서·장소·직위 등)
const NOT_NAME = /(팀|실|소|부|그룹|공장|센터|사업장|창고|대리|과장|차장|부장|주임|사원|팀장|담당|현장|협력|업체|전체|공통|완료|미완료|해당|없음|점검|대표|이사|상무|전무|고문|직원|관리|안전|환경|보건|생산|품질|연구|지원|경영|설비|전기|소방|기계)$/;
const NAMES = [...nameWords].filter((w) => !NOT_NAME.test(w) && !STOP.has(w)).sort((a, b) => b.length - a.length);
const TITLE = "(?:\\s*(?:님|씨|대리|과장|차장|부장|주임|사원|팀장|책임|선임|수석|프로|매니저|TL|PL))?";
const ROLE_WORDS = new Set(["사장", "부사장", "대표", "공장장", "팀장", "부서장", "소장", "반장", "조장", "직장", "실장", "본부장", "센터장", "그룹장", "파트장"]);
let removed = 0;
const hits = {};
const hit = (m) => ((hits[m.trim()] = (hits[m.trim()] ?? 0) + 1), removed++, "담당자");
function scrub(s) {
  let out = s;
  for (const n of NAMES) {
    const re = new RegExp(`\\(?${n}${TITLE}\\)?`, "g");
    out = out.replace(re, hit);
  }
  // 목록에 없는 "홍길동 대리" 형태
  out = out.replace(/([가-힣]{2,3})\s?(대리|과장|차장|부장|주임|사원|님)(?![가-힣])/g, (m, a) => (ROLE_WORDS.has(a) || a === "담당자" ? m : hit(m)));
  return out.replace(/(담당자[\s,]*){2,}/g, "담당자 ").replace(/\s{2,}/g, " ").trim();
}

// ------------------------------------------------------------------ 중복 제거
const seen = new Set();
const examples = [];
for (const r of records) {
  const problem = scrub(r.problem);
  const key = `${norm(r.location)}|${norm(problem)}`;
  if (seen.has(key)) continue;
  seen.add(key);
  examples.push({ ...r, problem });
}
if (AUDIT) {
  writeFileSync(new URL("../.cache/scrub-audit.json", import.meta.url), JSON.stringify(hits, null, 1));
  console.log("지운 낱말 목록 저장 : ehs-web/.cache/scrub-audit.json", Object.keys(hits).length, "종류");
  process.exit(0);
}
console.log(`엑셀 ${files.length}개 (암호로 못 읽음 ${locked.length}개) · 사진 있는 지적사항 ${records.length}건 → 중복 제외 ${examples.length}건 · 이름 지움 ${removed}곳`);

// ------------------------------------------------------------------ 사진 특징값
const cache = new URL("../.cache/clip-vision-q8.onnx", import.meta.url);
if (!existsSync(cache)) {
  console.log("모델 내려받는 중 (약 89MB, 처음 한 번)…");
  const buf = Buffer.from(await (await fetch(MODEL_URL)).arrayBuffer());
  (await import("node:fs")).mkdirSync(new URL("../.cache/", import.meta.url), { recursive: true });
  writeFileSync(cache, buf);
}
ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(readFileSync(cache), { executionProviders: ["wasm"] });

async function embed(buf) {
  const { data } = await sharp(buf).rotate().resize(224, 224, { fit: "cover", kernel: "cubic" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = new Float32Array(3 * 224 * 224);
  for (let i = 0; i < 224 * 224; i++) for (let c = 0; c < 3; c++) px[c * 224 * 224 + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  const v = (await session.run({ pixel_values: new ort.Tensor("float32", px, [1, 3, 224, 224]) })).image_embeds.data;
  const len = Math.hypot(...v);
  return Buffer.from(Int8Array.from(v, (x) => Math.max(-127, Math.min(127, Math.round((x / len) * 127)))).buffer).toString("base64");
}

const out = [];
let failed = 0;
for (const [i, e] of examples.entries()) {
  try {
    out.push({ source: e.source, location: e.location || null, sub_location: e.sub || null, type_name: e.type || null, problem: e.problem, emb: await embed(e.photo) });
  } catch {
    failed++;
  }
  if ((i + 1) % 200 === 0) console.log(`  특징값 ${i + 1}/${examples.length}`);
}
console.log(`특징값 완료 ${out.length}건 (사진 읽기 실패 ${failed}건)`);
if (locked.length) console.log("\n암호가 걸려 못 읽은 엑셀:\n  " + locked.join("\n  "));

const preview = new URL("../.cache/examples-preview.json", import.meta.url);
writeFileSync(preview, JSON.stringify(out.map(({ emb: _e, ...x }) => (void _e, x)), null, 1));
console.log(`\n미리보기 저장 : ehs-web/.cache/examples-preview.json`);

if (!APPLY) {
  console.log("확인만 했습니다. DB 반영은 --apply 를 붙여 실행하세요.");
  process.exit(0);
}
const del = await db.from("finding_examples").delete().gte("id", 0);
if (del.error) throw new Error("기존 사례 지우기 : " + del.error.message);
for (let i = 0; i < out.length; i += 500) {
  const { error } = await db.from("finding_examples").insert(out.slice(i, i + 500));
  if (error) throw new Error("사례 넣기 : " + error.message);
}
console.log(`DB 반영 완료 : finding_examples ${out.length}건`);
