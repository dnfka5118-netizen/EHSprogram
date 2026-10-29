import { notFound } from "next/navigation";
import { getModuleAccess } from "@/lib/access";
import { PageHeader } from "@/components/PageHeader";

// 위험성평가 › AI 위험성평가 작성 (1단계 : 과거 JSA · 타사 참고 · 공단 SIF 에서 비슷한 사례 찾기 → 새 JSA 초안)
export default async function RiskAiLayout({ children }: LayoutProps<"/risk/ai">) {
  const mod = (await getModuleAccess()).find((m) => m.code === "risk_adhoc");
  if (!mod || !mod.is_enabled || mod.level === "none") notFound();
  return (
    <>
      <PageHeader title="AI 위험성평가 작성" crumbs={[{ label: "안전", href: "/ehs/safety" }, { label: "위험성평가" }, { label: "AI 위험성평가 작성", href: "/risk/ai" }]}>
        <p className="pb-3 text-xs text-gray-500">작업명이나 표준운전절차서로 비슷한 과거 위험성평가 · 타사 사례 · 공단 사망사고(SIF) 사례를 찾아 새 평가서의 초안으로 씁니다.</p>
      </PageHeader>
      {children}
    </>
  );
}
