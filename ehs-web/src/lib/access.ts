import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";
import { getProfile } from "./auth";
import type { Module, PermLevel } from "./types";

export type ModuleAccess = Module & { level: PermLevel };

// SQL perm_level() 과 같은 규칙 (화면 표시용, 실제 권한은 DB 가 강제)
export const getModuleAccess = cache(async (): Promise<ModuleAccess[]> => {
  const profile = await getProfile();
  if (!profile) return [];
  const supabase = await createClient();
  const [{ data: modules }, { data: perms }] = await Promise.all([
    supabase.from("modules").select("*").order("sort_order"),
    supabase.from("user_permissions").select("module_code, level").eq("user_id", profile.id),
  ]);
  const map = new Map((perms ?? []).map((p) => [p.module_code as string, p.level as PermLevel]));
  return ((modules ?? []) as Module[]).map((m) => {
    let level: PermLevel;
    if (profile.is_admin) level = "write";
    else level = map.get(m.code) ?? (profile.user_type === "employee" ? "write" : "none");
    return { ...m, level };
  });
});

export async function getModuleBySlug(slug: string) {
  const list = await getModuleAccess();
  return list.find((m) => m.slug === slug && m.is_enabled && m.form === "finding") ?? null;
}
