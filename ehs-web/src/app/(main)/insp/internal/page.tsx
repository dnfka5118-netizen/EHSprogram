import { redirect } from "next/navigation";
import { getInternalModules } from "@/lib/access";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui";

// 내부점검 → 첫 번째 점검 탭으로
export default async function InternalInspectionIndex() {
  const [first] = await getInternalModules();
  if (first) redirect(`/insp/${first.slug}`);
  return (
    <>
      <PageHeader title="내부점검" crumbs={[{ label: "안전", href: "/ehs/safety" }, { label: "점검" }]} />
      <Card>
        <p className="py-8 text-center text-sm text-gray-500">열람 권한이 있는 내부점검이 없습니다. 관리자에게 문의하세요.</p>
      </Card>
    </>
  );
}
