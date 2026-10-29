import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getModuleAccess } from "@/lib/access";
import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { SopTabs } from "./SopTabs";

// 안전 › 표준운전절차서 (안전운전 절차서 CF410-01 R02)
export default async function SopLayout({ children }: LayoutProps<"/sop">) {
  const me = await requireProfile();
  const mod = (await getModuleAccess()).find((m) => m.code === "sop");
  if (!mod || !mod.is_enabled || mod.level === "none") notFound();
  const canWrite = mod.level === "write" && me.user_type === "employee";
  return (
    <>
      <PageHeader
        title="표준운전절차서"
        crumbs={[{ label: "안전", href: "/ehs/safety" }, { label: "표준운전절차서" }, { label: "표준운전절차서 현황", href: "/sop" }]}
        actions={
          canWrite && (
            <Link href="/sop/new" className="rounded-md bg-brand-800 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900">
              + 절차서 작성
            </Link>
          )
        }
      >
        <Suspense>
          <SopTabs />
        </Suspense>
      </PageHeader>
      {children}
    </>
  );
}
