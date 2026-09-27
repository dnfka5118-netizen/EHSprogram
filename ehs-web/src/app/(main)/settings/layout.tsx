import { requireAdmin } from "@/lib/auth";
import { SettingsTab } from "./SettingsTab";

const TABS = [
  { href: "/settings/users", label: "사용자·권한" },
  { href: "/settings/departments", label: "부서·결재자" },
  { href: "/settings/sites", label: "사업장" },
  { href: "/settings/locations", label: "장소" },
  { href: "/settings/types", label: "유형" },
  { href: "/settings/mail", label: "메일 발송" },
];

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">환경설정</h1>
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((t) => (
          <SettingsTab key={t.href} href={t.href}>
            {t.label}
          </SettingsTab>
        ))}
      </div>
      {children}
    </div>
  );
}
