import Link from "next/link";
import { notFound } from "next/navigation";
import { getModuleAccess } from "@/lib/access";
import { PageHeader } from "@/components/PageHeader";

// 위험성평가 › 수시 위험성평가(JSA)
export default async function JsaLayout({ children }: LayoutProps<"/risk/adhoc">) {
  const mod = (await getModuleAccess()).find((m) => m.code === "risk_adhoc");
  if (!mod || !mod.is_enabled || mod.level === "none") notFound();
  return (
    <>
      <PageHeader
        title="수시 위험성평가 (JSA)"
        crumbs={[{ label: "위험성평가" }, { label: "수시 위험성평가", href: "/risk/adhoc" }]}
        actions={
          mod.level === "write" && (
            <Link href="/risk/adhoc/new" className="rounded-md bg-brand-800 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900">
              + 새 평가서
            </Link>
          )
        }
      >
        <p className="pb-3 text-xs text-gray-500">위험성평가업무규정(SYMC-F110) 기준 · 작업 위험성평가서 CF112-01/02 R02 · 안전작업허가서 발행 전에 실시합니다.</p>
      </PageHeader>
      {children}
    </>
  );
}
