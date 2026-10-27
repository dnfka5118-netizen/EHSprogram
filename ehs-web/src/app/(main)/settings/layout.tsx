import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { TabLinks } from "@/components/TabLinks";

const TABS = [
  { href: "/settings/users", label: "사용자·권한" },
  { href: "/settings/departments", label: "부서·결재자" },
  { href: "/settings/approvals", label: "양식별 결재선" },
  { href: "/settings/sites", label: "사업장" },
  { href: "/settings/locations", label: "장소" },
  { href: "/settings/types", label: "유형" },
  { href: "/settings/daily", label: "일일점검 구역" },
  { href: "/settings/chem", label: "유해화학물질 점검" },
  { href: "/settings/schedules", label: "점검 주기" },
  { href: "/settings/reminders", label: "알림" },
  { href: "/settings/mail", label: "메일 발송" },
  { href: "/settings/audit", label: "감사 로그" },
];

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <PageHeader title="환경설정" crumbs={[{ label: "공통" }, { label: "환경설정" }]}>
        <TabLinks tabs={TABS} />
      </PageHeader>
      {children}
    </div>
  );
}
