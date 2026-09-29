import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui";

// 외부점검(사외점검) : 양식·흐름 설계 후 구현 예정
export default function ExternalInspectionPage() {
  return (
    <>
      <PageHeader title="외부점검" crumbs={[{ label: "안전", href: "/ehs/safety" }, { label: "점검" }, { label: "외부점검" }]} />
      <Card>
        <div className="py-10 text-center">
          <p className="font-medium text-gray-800">외부점검 기능은 준비 중입니다.</p>
          <p className="mt-1 text-sm text-gray-500">관공서·고객사·보험사 등 외부 기관 점검 결과와 조치를 관리하는 화면이 들어갈 예정입니다.</p>
        </div>
      </Card>
    </>
  );
}
