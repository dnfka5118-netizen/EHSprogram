import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession, getUid, requireProfile } from "@/lib/auth";
import { getModuleAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { filterMenu } from "@/lib/menu";
import { logout } from "@/app/login/actions";
import { AppShell } from "@/components/AppShell";

// 로그인 후 공통 틀 — 메뉴 정의는 src/lib/menu.ts
export default async function MainLayout({ children }: LayoutProps<"/">) {
  // 사용자·소속·권한과 결재 대기 건수를 동시에 조회 (DB 왕복 1번)
  const uid = await getUid();
  const supabase = await createClient();
  const [profile, session, access, { count: approvalCount }] = await Promise.all([
    requireProfile(),
    getSession(),
    getModuleAccess(),
    uid
      ? supabase.from("approval_steps").select("id", { count: "exact", head: true }).eq("approver_id", uid).eq("status", "pending")
      : Promise.resolve({ count: 0 }),
  ]);
  if (profile.must_change_password) redirect("/account/password");

  return (
    <Suspense>
      <AppShell
        user={{
          name: profile.name,
          orgLabel: [session?.siteName, session?.departmentName, profile.position].filter(Boolean).join(" "),
          contractor: profile.user_type === "contractor",
        }}
        domains={filterMenu(access, profile.is_admin)}
        favorites={profile.favorites ?? []}
        approvalCount={approvalCount ?? 0}
        logout={logout}
      >
        {children}
      </AppShell>
    </Suspense>
  );
}
