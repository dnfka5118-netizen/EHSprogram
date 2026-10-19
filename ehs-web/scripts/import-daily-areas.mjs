// 관리감독자 일일점검 Area 엑셀(장소 · 세부장소 · 부서 · 관리감독자 · 체크시트 기준서명) → 담당 Area · QR 지점
//   node scripts/import-daily-areas.mjs "../점검 DB/관리감독자 점검 양식/관리감독자 일일점검 Area R02.xlsx"          (미리보기)
//   node scripts/import-daily-areas.mjs "…xlsx" --apply                                                              (반영)
// · 관리감독자 한 사람 = 담당 Area 1개 (양식 A~D) → 하루 1번 점검 · 월 일지 1장
// · A·B형 행의 장소/세부장소 = QR 지점 (같은 장소는 하나의 QR 을 여러 Area 가 같이 씀)
// · C·D형은 QR 없음 (장소 '-' 는 부서장 D형)
// · 이미 있는 Area(이름 같음) · QR 지점(이름 같음)은 다시 만들지 않음
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const file = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!file) throw new Error("엑셀 경로를 넣어 주세요.");
const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

// 엑셀 표기 → 프로그램 표기
const LOCATION_ALIAS = { "과수 1공장": "과산화수소 1공장", "과수 2공장": "과산화수소 2공장", "윤정한, T3 Tank": "과산화수소 1공장" };
const SUB_ALIAS = { "T/C 주차장": "TC 주차장", "본관 지하": "본관지하" };
const DEPT_ALIAS = { 과수: "생산팀", 경영전략실: "ESG팀" };
const POINT_NAME = { "윤정한, T3 Tank|실외저장탱크": "T3 Tank 실외저장탱크" };

const txt = (c) => {
  const v = c.value;
  if (v == null) return "";
  if (typeof v === "object" && v.richText) return v.richText.map((x) => x.text).join("");
  if (typeof v === "object" && "result" in v) return String(v.result ?? "");
  return String(v);
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const ws = wb.worksheets[0];
const rows = [];
ws.eachRow((row, r) => {
  if (r === 1) return;
  const [loc, sub, dept, person, form] = [2, 3, 4, 5, 6].map((c) => txt(row.getCell(c)).replace(/\s+/g, " ").trim());
  if (!person) return;
  const code = form.match(/\(([A-D])형\)/)?.[1];
  rows.push({ r, loc, sub, dept, person, code });
});

const site = must(await db.from("sites").select("id").eq("code", "CA").single());
const [depts, locs, people, forms, oldAreas, oldPoints] = await Promise.all([
  db.from("departments").select("id, name, parent_id").eq("site_id", site.id).eq("is_active", true).then(must),
  db.from("locations").select("id, name, sub_locations(id, name)").eq("site_id", site.id).eq("is_active", true).then(must),
  db.from("profiles").select("id, name, position, is_active, department_id, departments!profiles_department_fk(name)").eq("is_active", true).then(must),
  db.from("daily_forms").select("*").then(must),
  db.from("daily_areas").select("id, name").then(must),
  db.from("daily_points").select("id, name").then((r) => (r.error ? [] : r.data)), // 0021 실행 전 미리보기
]);
const useQr = Object.fromEntries(forms.map((f) => [f.code, f.use_qr ?? !["C", "D"].includes(f.code)]));
const problems = [];

function findDept(name) {
  const n = DEPT_ALIAS[name] ?? name;
  return depts.find((d) => d.name === n && !d.parent_id) ?? null;
}
function findPerson(name, deptName) {
  const list = people.filter((p) => p.name === name);
  if (list.length <= 1) return list[0] ?? null;
  return list.find((p) => p.departments?.name === (DEPT_ALIAS[deptName] ?? deptName)) ?? list.find((p) => p.department_id) ?? list[0];
}
function findPlace(locName, subName) {
  const ln = LOCATION_ALIAS[locName] ?? locName;
  const sn = SUB_ALIAS[subName] ?? subName;
  for (const cand of [ln, `${ln} BDS실`]) {
    const l = locs.find((x) => x.name === cand);
    const s = l?.sub_locations.find((x) => x.name === sn);
    if (l && s) return { location: l, sub: s };
  }
  const l = locs.find((x) => x.name === ln);
  return l ? { location: l, sub: null } : null;
}

// 담당 Area (사람 · 양식) 와 QR 지점 (장소 · 세부장소)
const areas = new Map();
const points = new Map();
for (const x of rows) {
  if (!x.code) {
    problems.push(`${x.r}행 : 양식(A~D형)을 알 수 없음 "${x.person}"`);
    continue;
  }
  const p = findPerson(x.person, x.dept);
  const d = findDept(x.dept);
  if (!p) problems.push(`${x.r}행 : 사용자 없음 "${x.person}"`);
  if (!d) problems.push(`${x.r}행 : 부서 없음 "${x.dept}"`);
  if (!p || !d) continue;
  const key = `${p.id}|${x.code}`;
  if (!areas.has(key)) areas.set(key, { name: `${p.name} (${x.code}형)`, person: p, form: x.code, dept: d, points: new Set(), places: [] });
  const a = areas.get(key);
  if (x.loc === "-" || !x.loc) continue;
  const placeName = POINT_NAME[`${x.loc}|${x.sub}`] ?? (x.loc === "사업장 전체" || x.sub === x.loc ? SUB_ALIAS[x.sub] ?? x.sub : x.loc.endsWith(` ${x.sub}`) ? LOCATION_ALIAS[x.loc] ?? x.loc : `${LOCATION_ALIAS[x.loc] ?? x.loc} ${SUB_ALIAS[x.sub] ?? x.sub}`);
  a.places.push(placeName);
  if (!useQr[x.code]) continue; // C·D형 : QR 없음
  if (!points.has(placeName)) {
    const place = findPlace(x.loc, x.sub);
    if (!place) problems.push(`${x.r}행 : 장소 없음 "${x.loc}" (QR 지점은 장소 없이 만듦)`);
    else if (!place.sub) problems.push(`${x.r}행 : 세부장소 없음 "${x.loc} / ${x.sub}" (장소만 연결)`);
    points.set(placeName, { name: placeName, location: place?.location ?? null, sub: place?.sub ?? null });
  }
  a.points.add(placeName);
}

console.log(`엑셀 ${rows.length}행 → 담당 Area ${areas.size}개 · QR 지점 ${points.size}곳\n`);
for (const a of areas.values()) {
  console.log(`■ ${a.name} · ${a.dept.name}${useQr[a.form] ? "" : " · QR 없음"}  ${a.points.size ? [...a.points].join(", ") : a.places.join(", ") || "(부서 전체)"}`);
}
console.log(`\nQR 지점 : ${[...points.values()].map((p) => `${p.name}${p.location ? "" : "(장소 미연결)"}`).join(", ")}`);
if (problems.length) console.log(`\n확인 필요 ${problems.length}건\n- ${problems.join("\n- ")}`);
if (!APPLY) {
  console.log("\n미리보기만 했습니다. 반영하려면 --apply 를 붙여 다시 실행하세요.");
  process.exit(0);
}

// ---- 반영
const pointId = new Map(oldPoints.map((p) => [p.name, p.id]));
let order = 0;
for (const p of points.values()) {
  order += 10;
  if (pointId.has(p.name)) continue;
  const row = must(
    await db
      .from("daily_points")
      .insert({ site_id: site.id, name: p.name, location_id: p.location?.id ?? null, sub_location_id: p.sub?.id ?? null, sort_order: order })
      .select("id")
      .single(),
  );
  pointId.set(p.name, row.id);
}
const areaId = new Map(oldAreas.map((a) => [a.name, a.id]));
let created = 0;
order = 0;
for (const a of areas.values()) {
  order += 10;
  let id = areaId.get(a.name);
  if (!id) {
    const text = a.points.size ? null : a.form === "D" ? `${a.dept.name} 전체 (부서장)` : a.places.join(", ") || null;
    id = must(
      await db
        .from("daily_areas")
        .insert({ site_id: site.id, name: a.name, form_code: a.form, department_id: a.dept.id, area_text: text, sort_order: order })
        .select("id")
        .single(),
    ).id;
    created++;
  }
  must(await db.from("daily_area_members").upsert({ area_id: id, user_id: a.person.id }, { onConflict: "area_id,user_id", ignoreDuplicates: true }));
  for (const pn of a.points) must(await db.from("daily_area_points").upsert({ area_id: id, point_id: pointId.get(pn) }, { onConflict: "area_id,point_id", ignoreDuplicates: true }));
  // 점검 지표 : 담당자 = 점검 주기 매일
  must(
    await db
      .from("inspection_schedules")
      .upsert({ module_code: "insp_daily", user_id: a.person.id, period: "daily", note: "일일점검 구역 담당 (자동)" }, { onConflict: "module_code,user_id", ignoreDuplicates: true }),
  );
}
console.log(`\n반영 완료 : 담당 Area ${created}개 새로 만듦 · QR 지점 ${pointId.size}곳`);
