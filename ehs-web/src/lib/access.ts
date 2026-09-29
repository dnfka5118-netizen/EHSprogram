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
    const level: PermLevel = s.profile.is_admin ? "write" : (map.get(m.code) ?? (s.profile.user_type === "employee" ? "write" : "none"));
    return { ...m, level };
  });
});

export async function getModuleBySlug(slug: string) {
  const list = await getModuleAccess();
  return list.find((m) => m.slug === slug && m.is_enabled && m.form === "finding") ?? null;
}

// 내부점검(사내점검) 탭 : 사용 중이고 열람 권한이 있는 지적사항형 점검
export async function getInternalModules() {
  return (await getModuleAccess()).filter((m) => m.is_enabled && m.form === "finding" && m.category === "사내점검" && m.level !== "none");
}
