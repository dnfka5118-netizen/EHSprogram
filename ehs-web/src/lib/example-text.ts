// 과거 지적 사례 문구 다듬기 · 같은 뜻 문장 판별 (import 없음 — scripts/*.mjs 에서도 그대로 불러 씀)
//   cleanProblem : 앞 번호("1." "①" "-") 지우기, 한 칸에 "1. … 2. …" 로 여러 건 적은 것은 나누기,
//                  "※ 횡전개 필요" "(조치 완료)" 같은 메모 지우기, 엑셀 줄바꿈은 한 줄로
//   sameMeaning  : 핵심 낱말이 거의 같으면 같은 뜻 (추천 목록에서 하나만 보여 주는 데 씀)

const NOTE = [/\s*※\s*횡전개\s*(필요|요망|요함)?/g, /\(\s*(횡전개|조치\s*완료)\s*\)/g];
const LEAD = /^[\s\-–—•·*▶►■□○●]+/;
const NUM = /^\s*(?:\d{1,2}\s*[.)]|[①-⑳])\s*/;
const SPLIT = /(?:^|\s)(\d{1,2}\s*[.)]|[①-⑳])\s+/g;

const circled = (s: string) => ("①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳".indexOf(s) >= 0 ? "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳".indexOf(s) + 1 : Number.parseInt(s, 10));

function tidy(s: string) {
  return s
    .replace(LEAD, "")
    .replace(NUM, "")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,\-–]+$/, "")
    .trim();
}

export function cleanProblem(src: string): string[] {
  let t = src.replace(/\r/g, "");
  for (const re of NOTE) t = t.replace(re, "");
  t = t.trim();
  // "1. … 2. …" 로 시작하고 번호가 1부터 차례대로이며 나눈 조각이 모두 문장(한글 4자 이상)일 때만 나눔
  if (NUM.test(t)) {
    const marks = [...t.matchAll(SPLIT)];
    const nums = marks.map((m) => circled(m[1].replace(/[\s.)]/g, "")));
    if (marks.length >= 2 && nums.every((n, i) => n === i + 1)) {
      const parts = marks.map((m, i) => tidy(t.slice(m.index! + m[0].length, marks[i + 1]?.index ?? t.length)));
      if (parts.every((p) => (p.match(/[가-힣]/g) ?? []).length >= 4)) return parts;
    }
  }
  const one = tidy(t);
  return one.length >= 3 ? [one] : [];
}

// 뜻을 가르지 않는 낱말 · 끝에 붙는 조사
const STOP = new Set(["필요", "미흡", "관리", "조치", "요망", "요함", "개선", "실시", "확인", "검토", "및", "등", "시", "부족", "바람", "필요함", "불량", "상태", "위해", "위한"]);
const JOSA = /(으로|에서|에는|에도|에|의|을|를|이|가|은|는|로|와|과|도)$/;

function words(s: string) {
  const out = new Set<string>();
  for (let w of s.toLowerCase().replace(/[^0-9a-z가-힣]+/g, " ").split(" ")) {
    if (w.length > 2 && /[가-힣]$/.test(w)) w = w.replace(JOSA, "");
    if (w && !STOP.has(w)) out.add(w);
  }
  return out;
}
export const wordCount = (s: string) => words(s).size;
const near = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 2 && (a.startsWith(b) || b.startsWith(a)));

// 짧은 쪽 핵심 낱말의 80% 이상이 긴 쪽에도 있으면 같은 뜻 (낱말 1개짜리는 완전히 같아야)
export function sameMeaning(a: string, b: string): boolean {
  const [x, y] = [words(a), words(b)].sort((p, q) => p.size - q.size);
  if (x.size === 0) return false;
  let hit = 0;
  for (const w of x) if ([...y].some((v) => near(w, v))) hit++;
  return x.size === 1 ? hit === 1 && y.size === 1 : hit / x.size >= 0.8;
}
