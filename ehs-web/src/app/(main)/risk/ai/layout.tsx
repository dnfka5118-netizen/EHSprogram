import { notFound } from "next/navigation";
import { getModuleAccess } from "@/lib/access";
import { PageHeader } from "@/components/PageHeader";

// 위험성평가 › AI 위험성평가 작성 (우리 JSA 뼈대 초안 + 타사 · 공단 SIF · KOSHA 지침 보완 → 새 JSA)
export default async function RiskAiLayout({ children }: LayoutProps<"/risk/ai">) {
  const mod = (await getModuleAccess()).find((m) => m.code === "risk_adhoc");
  if (!mod || !mod.is_enabled || mod.level === "none") notFound();
  return (
    <>
      <PageHeader title="AI 위험성평가 작성" crumbs={[{ label: "안전", href: "/ehs/safety" }, { label: "위험성평가" }, { label: "AI 위험성평가 작성", href: "/risk/ai" }]}>
        <p className="pb-3 text-xs text-gray-500">작업 설명이나 표준운전절차서로 우리 JSA 를 뼈대로 한 초안을 만들고, 타사 사례 · 공단 사망사고(SIF) · KOSHA 안전지침으로 위험요인과 대책을 보완합니다.</p>
      </PageHeader>
      {children}
    </>
  );
}
