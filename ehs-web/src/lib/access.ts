import "server-only";
import { cache } from "react";
import { getSession, type ModuleAccess } from "./auth";
import type { PermLevel } from "./types";

export type { ModuleAccess };

// SQL perm_level() 과 같은 규칙 (화면 표시용, 실제 권한은 DB 가 강제) — 추가 DB 조회 없음
export const getModuleAccess = cache(async (): Promise<ModuleAccess[]> => {
  const s = await getSession();
  if (!s) return [];
  const map = new Map(s.perms.map((p) => [p.module_code, p.level as PermLevel]));
  return s.modules.map((m) => {
    const level: PermLevel = s.profile.is_admin
      ? "write"
      : (map.get(m.code) ?? (m.restricted ? "none" : s.profile.user_type === "employee" ? "write" : "none"));
    return { ...m, level };
  });
});

export async function getModuleBySlug(slug: string) {
  const list = await getModuleAccess();
  return list.find((m) => m.slug === slug && m.is_enabled && m.form === "finding") ?? null;
}

// 점검 지표 탭을 볼 수 있는지 (환경설정 → 사용자 권한에서 '점검 지표' 를 준 사람 · 관리자)
// 관리감독자 일일점검 전체 현황 탭 (0031 · 환경설정에서 사람마다 권한)
export async function canViewDailyOverview() {
  return (await getModuleAccess()).some((m) => m.code === "insp_daily_overview" && m.level !== "none");
}

export async function canViewKpi() {
  return (await getModuleAccess()).some((m) => m.code === "insp_kpi" && m.level !== "none");
}

// 내부점검(사내점검) 탭 : 사용 중이고 열람 권한이 있는 지적사항형 점검
export async function getInternalModules() {
  return (await getModuleAccess()).filter((m) => m.is_enabled && m.form === "finding" && m.category === "사내점검" && m.level !== "none");
}
