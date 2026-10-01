import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Module, PermLevel, Profile } from "./types";

export type ModuleAccess = Module & { level: PermLevel };
export type SessionData = {
  profile: Profile;
  siteName: string | null;
  departmentName: string | null;
  modules: Module[];
  perms: { module_code: string; level: PermLevel }[];
};

// 로그인 토큰의 사용자 ID (서버 안에서 서명 확인 · DB 왕복 없음)
export const getUid = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
});

// 요청 단위로 1회 : 로그인 사용자 · 소속 · 메뉴 권한을 DB 왕복 1번(동시 조회)으로
export const getSession = cache(async (): Promise<SessionData | null> => {
  const uid = await getUid();
  if (!uid) return null;
  const supabase = await createClient();
  const [{ data: profile }, { data: modules }, { data: perms }] = await Promise.all([
    supabase.from("profiles").select("*, sites(name), departments!profiles_department_fk(name, parent_id)").eq("id", uid).maybeSingle(),
    supabase.from("modules").select("*").order("sort_order"),
    supabase.from("user_permissions").select("module_code, level").eq("user_id", uid),
  ]);
  if (!profile) return null;
  const { sites, departments, ...rest } = profile as Profile & { sites: { name: string } | null; departments: { name: string; parent_id: string | null } | null };
  return {
    profile: { ...(rest as Profile), team_id: departments?.parent_id ?? (rest as Profile).department_id },
    siteName: sites?.name ?? null,
    departmentName: departments?.name ?? null,
    modules: (modules ?? []) as Module[],
    perms: (perms ?? []) as SessionData["perms"],
  };
});

export const getProfile = cache(async (): Promise<Profile | null> => (await getSession())?.profile ?? null);

export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile || !profile.is_active) redirect("/login?e=inactive");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (!profile.is_admin) redirect("/");
  return profile;
}
