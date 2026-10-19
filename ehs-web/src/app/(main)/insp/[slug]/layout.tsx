import Link from "next/link";
import { notFound } from "next/navigation";
import { canViewKpi, getInternalModules, getModuleBySlug } from "@/lib/access";
import { PageHeader } from "@/components/PageHeader";
import { TabLinks } from "@/components/TabLinks";

// 내부점검 공통 머리 : 점검 › 내부점검 › {점검명} + 점검 종류 탭
export default async function InternalInspectionLayout({ params, children }: LayoutProps<"/insp/[slug]">) {
  const { slug } = await params;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.level === "none") notFound();
  const tabs = (await getInternalModules()).map((m) => ({ href: `/insp/${m.slug}`, label: m.name }));
  if (await canViewKpi()) tabs.push({ href: "/insp/kpi", label: "점검 지표" });

  return (
    <>
      <PageHeader
        title={mod.name}
        crumbs={[{ label: "안전", href: "/ehs/safety" }, { label: "점검" }, { label: mod.name }]}
        actions={
          <>
            <Link href={`/insp/${slug}/report`} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">
              월별 보고서
            </Link>
            {mod.code === "insp_daily" && (
              <Link href="/insp/daily/logs" className="rounded-md bg-brand-800 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900">
                월간 일지
              </Link>
            )}
            {mod.level === "write" && !["insp_daily", "insp_chem"].includes(mod.code) && (
              <Link href={`/insp/${slug}/new`} className="rounded-md bg-brand-800 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900">
                + 점검 등록
              </Link>
            )}
          </>
        }
      >
        <TabLinks tabs={tabs} />
      </PageHeader>
      {children}
    </>
  );
}
