import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getModuleAccess } from "@/lib/access";
import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { PermitTabs } from "./PermitTabs";

export default async function PermitLayout({ children }: LayoutProps<"/permit">) {
  const me = await requireProfile();
  const mod = (await getModuleAccess()).find((m) => m.code === "permit");
  if (!mod || !mod.is_enabled || mod.level === "none") notFound();
  const canWrite = mod.level === "write" && me.user_type === "employee";
  return (
    <>
      <PageHeader
        title="안전작업허가"
        crumbs={[{ label: "안전작업허가", href: "/permit" }]}
        actions={
          canWrite && (
            <Link href="/permit/new" className="rounded-md bg-brand-800 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900">
              + 허가서 신청
            </Link>
          )
        }
      >
        <Suspense>
          <PermitTabs />
        </Suspense>
      </PageHeader>
      {children}
    </>
  );
}
