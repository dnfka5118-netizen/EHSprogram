// 사용자 매뉴얼용 휴대폰 화면 캡처 (아이폰 크기 390×844) — 점검 등록부터 종결 승인까지 실제로 눌러 가며 찍는다
//
//   1) npx next build && npx next start -p 3457      (다른 창에서 켜 둠)
//   2) node scripts/manual-shots.mjs [점검 slug, 기본 ceo] [담당자 이름]
//
// - 임시 관리자 계정(manual-shots@example.invalid, 이름 "시연 점검자")으로 시연용 지적사항 1건을 만들어 절차를 진행하고,
//   끝나면 그 지적사항 · 사진 · 알림 · 점검 회차 · 임시 계정을 모두 지운다 (다른 직원 자료는 화면에 나오지 않게 장소 조건을 건다)
// - 캡처는 ehs-web/.cache/manual/ (저장소에 올리지 않음)
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const SLUG = process.argv[2] || "ceo";
const ASSIGNEE = process.argv[3] || "김우람";
const BASE = process.env.BASE || "http://localhost:3457";
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = fileURLToPath(new URL("../.cache/manual/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 시연용 사진 (회사 전경 사진을 잘라 씀)
const bg = fileURLToPath(new URL("../public/login-bg.jpg", import.meta.url));
const before = OUT + "demo-before.jpg";
const after = OUT + "demo-after.jpg";
await sharp(bg).extract({ left: 0, top: 120, width: 300, height: 207 }).resize(1200, 828).jpeg().toFile(before);
await sharp(bg).extract({ left: 600, top: 110, width: 330, height: 217 }).resize(1200, 790).modulate({ brightness: 1.08 }).jpeg().toFile(after);

const email = "manual-shots@example.invalid";
const password = "Man-" + Math.random().toString(36).slice(2) + "9a";
const old = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === email);
if (old) await admin.auth.admin.deleteUser(old.id);
const { data: site } = await admin.from("sites").select("id").eq("code", "CA").single();
const { data: ehs } = await admin.from("departments").select("id, name").in("name", ["EHS팀", "EHS부서"]).is("parent_id", null).limit(1).single();
const { data: loc } = await admin.from("locations").select("id, name, sub_locations(id, name)").eq("site_id", site.id).eq("name", "보행로").single();
const { data: u, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;
const uid = u.user.id;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--lang=ko-KR"] });
let n = 0;
const shot = async (page, name, opts = {}) => {
  await wait(opts.wait ?? 700);
  const file = `${String(++n).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: OUT + file, ...(opts.full ? { fullPage: true } : {}) });
  console.log("📷", file);
};
// 보이는 버튼 중 글자가 들어간 것 (last : 마지막 = 열린 창 안)
const button = async (page, text, last = false) => {
  const all = [];
  for (const b of await page.$$("button")) {
    const ok = await b.evaluate((e, t) => (e.textContent ?? "").includes(t) && e.offsetParent !== null && !e.disabled, text);
    if (ok) all.push(b);
  }
  const b = last ? all.at(-1) : all[0];
  if (!b) throw new Error(`버튼 없음 : ${text}`);
  await b.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await b.click();
};
// React 입력값 넣기 (select · input · textarea)
const setValue = (page, selector, index, value) =>
  page.evaluate(
    (sel, i, v) => {
      const els = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null);
      const el = i < 0 ? els.at(i) : els[i];
      const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    selector,
    index,
    value,
  );
const optionValue = (page, selIndex, text) =>
  page.evaluate(
    (i, t) => {
      const s = [...document.querySelectorAll("select")].filter((e) => e.offsetParent !== null)[i];
      return [...s.options].find((o) => o.textContent.trim() === t)?.value ?? "";
    },
    selIndex,
    text,
  );
const scrollTo = (page, text) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll("label, h2, h3, p, span, button")].find((e) => (e.textContent ?? "").trim().startsWith(t));
    el?.scrollIntoView({ block: "start" });
    window.scrollBy(0, -80);
  }, text);

let findingId = null;
try {
  await admin.from("profiles").insert({ id: uid, email, name: "시연 점검자", position: "대리", site_id: site.id, department_id: ehs.id, must_change_password: false, is_admin: true });
  const jar = new Map();
  const sb = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (c) => c.forEach(({ name, value }) => jar.set(name, value)) },
  });
  if ((await sb.auth.signInWithPassword({ email, password })).error) throw new Error("로그인 실패");

  // 로그인 화면 (로그인 전)
  const guest = await browser.newPage();
  await guest.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await guest.goto(BASE + "/login", { waitUntil: "networkidle2" });
  await shot(guest, "로그인");
  await guest.close();

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setCookie(...[...jar].map(([name, value]) => ({ name, value, domain: new URL(BASE).hostname, path: "/" })));
  const list = `${BASE}/insp/${SLUG}?status=all&loc=${loc.id}`;

  // 메뉴
  await page.goto(list, { waitUntil: "networkidle2" }); // 다른 직원 자료가 뒤에 비치지 않게 조건 건 현황에서
  await page.click('button[aria-label="메뉴 열기"]');
  await shot(page, "메뉴");

  // ① 점검 등록
  await page.goto(`${BASE}/insp/${SLUG}/new`, { waitUntil: "networkidle2" });
  await shot(page, "점검등록-빈화면");
  const files = await page.$$('input[type="file"]');
  await files[1].uploadFile(before);
  await wait(2500);
  await shot(page, "점검등록-사진");
  await setValue(page, "select", 0, loc.id);
  await wait(300);
  await setValue(page, "select", 1, loc.sub_locations[0].id);
  await button(page, "3정5S").catch(() => button(page, "기타"));
  await page.evaluate(() => {
    const t = [...document.querySelectorAll("textarea")].find((e) => e.offsetParent !== null);
    t.scrollIntoView({ block: "center" });
  });
  await setValue(page, "textarea", 0, "보행로에 자재가 쌓여 있어 통행이 어려움 — 정위치 보관 필요");
  await setValue(page, "select", -1, await optionValue(page, -1 + (await page.$$eval("select", (s) => s.filter((e) => e.offsetParent !== null).length)), ehs.name));
  await scrollTo(page, "장소");
  await shot(page, "점검등록-입력");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(page, "점검등록-부서와버튼");
  await button(page, "등록하고 마치기");
  await page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  const { data: f } = await admin.from("findings").select("id").eq("created_by", uid).order("created_at", { ascending: false }).limit(1).single();
  findingId = f.id;

  // 현황표 → ② 담당자 지정
  await page.goto(list, { waitUntil: "networkidle2" });
  await scrollTo(page, "지적사항 현황");
  await shot(page, "현황-담당자지정대기");
  await button(page, "담당자 지정");
  await wait(1500);
  await button(page, ASSIGNEE, true);
  await shot(page, "담당자지정-창");
  await button(page, "담당자 지정", true);
  await wait(2500);

  // ③ 개선계획
  await page.goto(list, { waitUntil: "networkidle2" });
  await scrollTo(page, "지적사항 현황");
  await shot(page, "현황-계획수립대기");
  await button(page, "조치계획 작성");
  await wait(800);
  await setValue(page, "textarea", 0, "자재를 지정 보관장소로 옮기고 통로 표시선 재도색");
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  await setValue(page, 'input[type="date"]', -3, today); // 창 안의 즉시조치 목표일 (뒤쪽 조회 조건 날짜 칸 제외)
  await shot(page, "조치계획-창");
  await button(page, "계획 저장", true);
  await wait(2500);

  // ④ 완료 보고
  await page.goto(list, { waitUntil: "networkidle2" });
  await scrollTo(page, "지적사항 현황");
  await shot(page, "현황-조치중");
  await button(page, "완료 여부 처리");
  await wait(800);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].filter((e) => e.offsetParent !== null && (e.textContent ?? "").trim() === "완료");
    b.at(-1)?.click();
  });
  const files2 = await page.$$('input[type="file"]');
  await files2.at(-1).uploadFile(after);
  await wait(2500);
  await shot(page, "완료보고-창");
  await button(page, "완료 보고", true);
  await wait(2500);

  // ⑤ 종결 승인
  await page.goto(list, { waitUntil: "networkidle2" });
  await scrollTo(page, "지적사항 현황");
  await shot(page, "현황-승인대기");
  await page.goto(list, { waitUntil: "networkidle2" });
  await scrollTo(page, "지적사항 현황");
  await button(page, "승인");
  await wait(2500);
  await page.goto(list, { waitUntil: "networkidle2" });
  await scrollTo(page, "지적사항 현황");
  await shot(page, "현황-종결");

  // 상세 화면 (처리 이력)
  await page.goto(`${BASE}/findings/${findingId}`, { waitUntil: "networkidle2" });
  await shot(page, "상세");
  await scrollTo(page, "처리 이력");
  await shot(page, "상세-처리이력");
  console.log(`\n캡처 ${n}장 : ehs-web/.cache/manual/`);
} finally {
  await browser.close();
  // 시연 자료 지우기 : 지적사항(사진 · 알림 포함) · 점검 회차 · 임시 계정
  const { data: mine } = await admin.from("findings").select("id").eq("created_by", uid);
  for (const x of mine ?? []) {
    const { data: ph } = await admin.from("finding_photos").select("path").eq("finding_id", x.id);
    const paths = (ph ?? []).flatMap((p) => [p.path, p.path.replace(/(\.[a-z]+)$/i, "_thumb$1"), p.path.replace(/\/([^/]+)$/, "/thumb/$1")]);
    const { data: listed } = await admin.storage.from("findings").list(x.id);
    const all = [...new Set([...paths, ...(listed ?? []).map((o) => `${x.id}/${o.name}`)])];
    if (all.length) await admin.storage.from("findings").remove(all);
    await admin.from("notifications").delete().eq("finding_id", x.id);
    await admin.from("findings").delete().eq("id", x.id);
  }
  await admin.from("inspections").delete().eq("created_by", uid);
  await admin.from("notifications").delete().eq("user_id", uid);
  await admin.auth.admin.deleteUser(uid);
  console.log(`정리 완료 : 시연 지적사항 ${mine?.length ?? 0}건 · 임시 계정 삭제`);
}
