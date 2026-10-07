// 휴대폰 화면 점검 : 가장 좁은 폭(기본 320px)에서 화면이 옆으로 넘치지 않는지 확인하고 캡처를 남긴다
//
//   1) npx next build && npx next start -p 3457      (다른 창에서 켜 둠)
//   2) node scripts/mobile-check.mjs / /insp/ceo /permit/new#line
//        경로 뒤 #menu = 메뉴 열기, #line = 허가서 상신 → 결재라인 지정 창 열기
//      W=360 node scripts/mobile-check.mjs /insp/ceo   ← 폭 바꾸기
//
// - 임시 관리자 계정(mobile-check@example.invalid)을 만들어 로그인하고 끝나면 지운다
// - 캡처는 ehs-web/.cache/mobile/ 에 저장 (저장소에 올리지 않음)
// - "가로 폭"이 화면 폭보다 크면 옆으로 넘치는 것 → 넘치는 요소를 함께 알려 줌
// - 컴퓨터에 설치된 크롬을 쓴다 (CHROME 환경변수로 경로 변경 가능)
import { mkdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";

const W = Number(process.env.W || 320);
const BASE = process.env.BASE || "http://localhost:3457";
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/insp/ceo", "/insp/ceo/new", "/permit/new", "/approvals"];
const OUT = new URL("../.cache/mobile/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = "mobile-check@example.invalid";
const password = "Mob-" + Math.random().toString(36).slice(2) + "9a";
const old = (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === email);
if (old) await admin.auth.admin.deleteUser(old.id);
const { data: site } = await admin.from("sites").select("id").limit(1).single();
const { data: dept } = await admin.from("departments").select("id").is("parent_id", null).limit(1).single();
const { data: u, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run"] });
const clickText = async (page, text) => {
  for (const b of await page.$$("button")) if ((await b.evaluate((e) => e.textContent ?? "")).includes(text)) return b.click();
};
try {
  await admin.from("profiles").insert({ id: u.user.id, email, name: "화면점검", position: "대리", site_id: site.id, department_id: dept.id, must_change_password: false, is_admin: true });
  const jar = new Map();
  const sb = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (c) => c.forEach(({ name, value }) => jar.set(name, value)) },
  });
  const s = await sb.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;

  const page = await browser.newPage();
  await page.setViewport({ width: W, height: 700, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setCookie(...[...jar].map(([name, value]) => ({ name, value, domain: new URL(BASE).hostname, path: "/" })));
  let bad = 0;
  for (const p of paths) {
    const [path, action] = p.split("#");
    await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 60000 });
    if (action === "menu") await page.click('button[aria-label="메뉴 열기"]');
    if (action === "line") {
      await clickText(page, "상신하기");
      await new Promise((r) => setTimeout(r, 800));
      await clickText(page, "결재라인 지정");
    }
    await new Promise((r) => setTimeout(r, 800));
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    const name = `${W}${path.replace(/[/?=&]/g, "_")}${action ? "_" + action : ""}.png`;
    await page.screenshot({ path: fileURLToPath(new URL(name, OUT)), fullPage: !action });
    if (sw > W) {
      bad++;
      // 옆으로 넘치는 가장 바깥 요소 (스크롤 상자 안쪽은 제외)
      const wide = await page.evaluate(() => {
        const out = [];
        const walk = (e, d) => {
          for (const k of e.children) {
            const r = k.getBoundingClientRect();
            if (r.right > window.innerWidth + 1 && getComputedStyle(e).overflowX === "visible") out.push(`${k.tagName}.${String(k.className).slice(0, 60)} (오른쪽 끝 ${Math.round(r.right)}px)`);
            else if (d < 16 && getComputedStyle(k).overflowX === "visible") walk(k, d + 1);
          }
        };
        walk(document.querySelector("main") ?? document.body, 0);
        return out.slice(0, 5);
      });
      console.log(`✗ ${p} : 가로 폭 ${sw}px > ${W}px\n    ${wide.join("\n    ")}`);
    } else console.log(`✓ ${p} : 가로 폭 ${sw}px`);
  }
  console.log(`\n캡처 : ehs-web/.cache/mobile/  ·  넘치는 화면 ${bad}개`);
} finally {
  await browser.close();
  await admin.auth.admin.deleteUser(u.user.id);
}
