import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getInternalModules } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import { AppShell, type MenuGroup } from "@/components/AppShell";

export default async function MainLayout({ children }: LayoutProps<"/">) {
  const profile = await requireProfile();
  if (profile.must_change_password) redirect("/account/password");

  const supabase = await createClient();
  const [internal, { data: site }, { data: dept }] = await Promise.all([
    getInternalModules(),
    profile.site_id ? supabase.from("sites").select("name").eq("id", profile.site_id).maybeSingle() : Promise.resolve({ data: null }),
    profile.department_id ? supabase.from("departments").select("name").eq("id", profile.department_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const menu: MenuGroup[] = [
    {
      label: "점검",
      items: [
        { label: "부서별 현황", href: "/dept" },
        { label: "외부점검", href: "/insp/external" },
        ...(internal.length
          ? [{ label: "내부점검", href: "/insp/internal", match: [...internal.map((m) => `/insp/${m.slug}`), "/findings"] }]
          : []),
      ],
    },
    { label: "위험성평가", soon: true },
    { label: "안전작업허가", soon: true },
    ...(profile.is_admin ? [{ label: "환경설정", href: "/settings" }] : []),
  ];

  return (
    <AppShell
      user={{
        name: profile.name,
        orgLabel: [site?.name, dept?.name, profile.position].filter(Boolean).join(" "),
        contractor: profile.user_type === "contractor",
      }}
      menu={menu}
      logout={logout}
    >
      {children}
    </AppShell>
  );
}
