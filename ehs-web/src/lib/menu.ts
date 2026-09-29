// 전체 메뉴 정의 (환경·보건·안전 × 공통 묶음 6개) — 메뉴 이름·순서는 이 파일만 고치면 된다
//   href 가 없으면 "준비 중" 으로 표시 · module 은 권한/사용 여부를 확인할 양식 코드(modules.code)
//   ※ 아직 만들지 않은 메뉴는 표준 EHS 업무 예시 — 실제 목록을 받으면 교체
export type DomainKey = "env" | "health" | "safety" | "common";
export type GroupKey = "plan" | "inspect" | "measure" | "work" | "edu" | "accident" | "common";

export type MenuItem = { label: string; href?: string; module?: string; match?: string[]; adminOnly?: boolean };
export type MenuSection = { key: GroupKey; label: string; items: MenuItem[] };
export type Domain = { key: DomainKey; label: string; short: string; home: string; sections: MenuSection[] };

// 세 분야가 같은 이름·순서의 묶음을 쓴다
export const GROUP_LABEL: Record<Exclude<GroupKey, "common">, string> = {
  plan: "계획·법규",
  inspect: "점검",
  measure: "측정·평가",
  work: "작업·시설관리",
  edu: "교육·건강",
  accident: "사고·실적",
};
const g = (key: Exclude<GroupKey, "common">, items: MenuItem[]): MenuSection => ({ key, label: GROUP_LABEL[key], items });

export const DOMAINS: Domain[] = [
  {
    key: "env",
    label: "환경",
    short: "E",
    home: "/ehs/env",
    sections: [
      g("plan", [{ label: "환경 인허가 관리" }, { label: "환경법규 등록부" }, { label: "환경목표·추진계획" }]),
      g("inspect", [{ label: "배출시설 자체점검" }, { label: "유해화학물질 자체점검", module: "insp_chem" }, { label: "환경 순회점검" }]),
      g("measure", [{ label: "대기 자가측정" }, { label: "수질 자가측정" }, { label: "소음·진동 측정" }, { label: "환경측면 영향평가" }]),
      g("work", [{ label: "폐기물 관리" }, { label: "화학물질 취급량 관리" }, { label: "방지시설 운영일지" }, { label: "용수·폐수 관리" }]),
      g("edu", [{ label: "환경교육" }]),
      g("accident", [{ label: "환경사고·누출 보고" }, { label: "온실가스·에너지 실적" }, { label: "환경 실적 보고" }]),
    ],
  },
  {
    key: "health",
    label: "보건",
    short: "H",
    home: "/ehs/health",
    sections: [
      g("plan", [{ label: "보건관리계획" }, { label: "보건 법규 등록부" }]),
      g("inspect", [{ label: "작업환경 점검" }, { label: "보호구 지급·점검" }]),
      g("measure", [{ label: "작업환경측정" }, { label: "근골격계 유해요인조사" }, { label: "화학물질 위험성평가" }]),
      g("work", [{ label: "MSDS 관리" }, { label: "국소배기장치 점검" }, { label: "밀폐공간 관리" }]),
      g("edu", [{ label: "일반·특수 건강검진" }, { label: "건강검진 사후관리" }, { label: "보건교육" }, { label: "직무스트레스 관리" }]),
      g("accident", [{ label: "직업병·질환 관리" }, { label: "보건 실적 보고" }]),
    ],
  },
  {
    key: "safety",
    label: "안전",
    short: "S",
    home: "/ehs/safety",
    sections: [
      g("plan", [{ label: "안전관리계획서" }, { label: "안전 법규 등록부" }]),
      g("inspect", [
        { label: "CEO 안전점검", href: "/insp/ceo", module: "insp_ceo", match: ["/insp/ceo"] },
        { label: "월간환경안전점검", href: "/insp/monthly", module: "insp_monthly", match: ["/insp/monthly"] },
        { label: "공장장 안전점검", href: "/insp/plant", module: "insp_plant", match: ["/insp/plant"] },
        { label: "관리감독자 일일점검", module: "insp_daily" },
        { label: "외부점검", href: "/insp/external" },
      ]),
      g("measure", [
        { label: "수시 위험성평가(JSA)", href: "/risk/adhoc", module: "risk_adhoc" },
        { label: "정기 위험성평가", module: "risk" },
        { label: "공정안전관리(PSM)" },
      ]),
      g("work", [
        { label: "안전작업허가 현황", href: "/permit", module: "permit", match: ["/permit"] },
        { label: "금일 작업 현황", href: "/permit?tab=today", module: "permit" },
        { label: "유해위험기계기구" },
        { label: "도급업체 안전관리" },
      ]),
      g("edu", [{ label: "안전교육" }, { label: "비상대응훈련" }]),
      g("accident", [{ label: "사고조사" }, { label: "아차사고" }, { label: "안전 실적 보고" }]),
    ],
  },
  {
    key: "common",
    label: "공통",
    short: "공통",
    home: "/",
    sections: [
      {
        key: "common",
        label: "공통",
        items: [
          { label: "내 할 일", href: "/" },
          { label: "전자결재", href: "/approvals" },
          { label: "부서별 점검 조치 현황", href: "/dept", match: ["/findings"] },
          { label: "개인설정", href: "/account/password" },
          { label: "환경설정", href: "/settings", adminOnly: true },
        ],
      },
    ],
  },
];

export const itemKey = (i: MenuItem) => i.href ?? `soon:${i.label}`;

// 경로에 맞는 메뉴 찾기 (쿼리 포함 href 는 정확히 같을 때만)
export function matches(pathname: string, search: string, i: MenuItem): boolean {
  if (!i.href) return false;
  const [path, q] = i.href.split("?");
  if (q) return pathname === path && search === `?${q}`;
  if (path === "/") return pathname === "/";
  const prefixes = [path, ...(i.match ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !(path === "/permit" && search.includes("tab=today"));
}

export function findDomain(domains: Domain[], pathname: string, search: string): DomainKey | null {
  for (const d of domains) {
    if (d.home !== "/" && (pathname === d.home || pathname.startsWith(`${d.home}/`))) return d.key;
    if (d.sections.some((s) => s.items.some((i) => matches(pathname, search, i)))) return d.key;
  }
  return null;
}

// 권한에 따라 메뉴 거르기 : 권한 없음 → 숨김 · 아직 사용하지 않는 양식 → 준비 중
export function filterMenu(access: { code: string; is_enabled: boolean; level: string }[], isAdmin: boolean): Domain[] {
  const mod = new Map(access.map((m) => [m.code, m]));
  return DOMAINS.map((d) => ({
    ...d,
    sections: d.sections.map((s) => ({
      ...s,
      items: s.items.flatMap((i): MenuItem[] => {
        if (i.adminOnly && !isAdmin) return [];
        if (!i.module) return [i];
        const m = mod.get(i.module);
        if (!m || !m.is_enabled) return [{ label: i.label }]; // 준비 중
        if (m.level === "none") return [];
        return [i];
      }),
    })),
  }));
}
