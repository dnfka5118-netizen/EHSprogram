import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getInternalModules, getModuleAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";
import { AppShell, type MenuGroup } from "@/components/AppShell";

export default async function MainLayout({ children }: LayoutProps<"/">) {
  const profile = await requireProfile();
  if (profile.must_change_password) redirect("/account/password");

  const supabase = await createClient();
  const [internal, { data: site }, { data: dept }, { count: approvalCount }] = await Promise.all([
    getInternalModules(),
    profile.site_id ? supabase.from("sites").select("name").eq("id", profile.site_id).maybeSingle() : Promise.resolve({ data: null }),
    profile.department_id ? supabase.from("departments").select("name").eq("id", profile.department_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("approval_steps").select("id", { count: "exact", head: true }).eq("approver_id", profile.id).eq("status", "pending"),
  ]);

  const access = await getModuleAccess();
  const riskAdhoc = access.some((m) => m.code === "risk_adhoc" && m.is_enabled && m.level !== "none");
  const permitOn = access.some((m) => m.code === "permit" && m.is_enabled && m.level !== "none");

  const menu: MenuGroup[] = [
    {
      label: "점검",
      icon: "inspect",
      items: [
        { label: "부서별 현황", href: "/dept" },
        { label: "외부점검", href: "/insp/external" },
        ...(internal.length
          ? [{ label: "내부점검", href: "/insp/internal", match: [...internal.map((m) => `/insp/${m.slug}`), "/findings"] }]
          : []),
      ],
    },
    ...(riskAdhoc
      ? [{ label: "위험성평가", icon: "risk" as const, items: [{ label: "수시 위험성평가(JSA)", href: "/risk/adhoc" }] }]
      : [{ label: "위험성평가", icon: "risk" as const, soon: true }]),
    ...(permitOn
      ? [
          {
            label: "안전작업허가",
            icon: "permit" as const,
            items: [
              { label: "안전작업허가 현황", href: "/permit", match: ["/permit"] },
              { label: "금일 작업 현황", href: "/permit?tab=today" },
            ],
          },
        ]
      : [{ label: "안전작업허가", icon: "permit" as const, soon: true }]),
    ...(profile.is_admin ? [{ label: "환경설정", icon: "settings" as const, href: "/settings" }] : []),
  ];

  return (
    <AppShell
      user={{
        name: profile.name,
        orgLabel: [site?.name, dept?.name, profile.position].filter(Boolean).join(" "),
        contractor: profile.user_type === "contractor",
      }}
      menu={menu}
      approvalCount={approvalCount ?? 0}
      logout={logout}
    >
      {children}
    </AppShell>
  );
}
