import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getModuleAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { filterMenu, type DomainKey } from "@/lib/menu";
import { todayKst } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";

type Kpi = { label: string; value: number; href: string; tone?: "red" | "amber" };

// 분야별 첫 화면 : 처리할 건수 + 묶음별 메뉴
export default async function DomainHome({ params }: PageProps<"/ehs/[domain]">) {
  const { domain: key } = await params;
  if (!["env", "health", "safety"].includes(key)) notFound();
  const me = await requireProfile();
  const domain = filterMenu(await getModuleAccess(), me.is_admin).find((d) => d.key === (key as DomainKey))!;
  const supabase = await createClient();

  const kpis: Kpi[] = [];
  if (key === "safety") {
    const today = todayKst();
    const [open, overdue, permits, jsaReview] = await Promise.all([
      supabase.from("finding_overview").select("id", { count: "exact", head: true }).neq("status", "closed"),
      supabase.from("finding_overview").select("id", { count: "exact", head: true }).eq("is_overdue", true),
      supabase.from("permit_overview").select("id", { count: "exact", head: true }).lte("start_dt", `${today}T23:59:59`).gte("end_dt", `${today}T00:00:00`),
      supabase.from("jsa_overview").select("id", { count: "exact", head: true }).eq("approval_status", "in_review"),
    ]);
    kpis.push(
      { label: "미완료 점검 지적사항", value: open.count ?? 0, href: "/dept?status=open" },
      { label: "목표일 지난 조치", value: overdue.count ?? 0, href: "/dept?status=overdue", tone: "red" },
      { label: "오늘 작업 허가", value: permits.count ?? 0, href: "/permit?tab=today", tone: "amber" },
      { label: "결재 중 위험성평가", value: jsaReview.count ?? 0, href: "/risk/adhoc?status=in_review" },
    );
  }
  const ready = domain.sections.reduce((n, s) => n + s.items.filter((i) => i.href).length, 0);
  const total = domain.sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="space-y-4">
      <PageHeader title={`${domain.label}(${domain.short})`} crumbs={[{ label: domain.label }, { label: "대시보드" }]}>
        <p className="pb-3 text-xs text-gray-500">
          메뉴 {total}개 중 {ready}개 사용 중 · 나머지는 준비 중입니다. 자주 쓰는 메뉴는 왼쪽 메뉴의 ☆ 를 눌러 즐겨찾기에 추가하세요.
        </p>
      </PageHeader>

      {kpis.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map((k) => (
            <Link key={k.label} href={k.href} className="rounded-lg border border-gray-200 bg-white p-4 hover:border-brand-600">
              <p className="text-xs text-gray-500">{k.label}</p>
              <p className={`mt-1 text-2xl font-bold ${k.value === 0 ? "text-gray-300" : k.tone === "red" ? "text-red-600" : k.tone === "amber" ? "text-amber-600" : "text-brand-800"}`}>{k.value}</p>
            </Link>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-3 text-sm text-gray-500">
          {domain.label} 분야 업무가 연결되면 처리할 건수가 여기에 표시됩니다.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {domain.sections.map((s) => (
          <section key={s.key} className="rounded-lg border border-gray-200 bg-white">
            <header className="border-b border-l-4 border-gray-100 border-l-brand-600 px-4 py-2.5 font-bold text-gray-900">{s.label}</header>
            <ul className="divide-y divide-gray-50 px-2 py-1">
              {s.items.map((i) =>
                i.href ? (
                  <li key={i.href}>
                    <Link href={i.href} className="flex items-center justify-between rounded px-2 py-2 text-sm text-gray-900 hover:bg-brand-50">
                      {i.label}
                      <span className="text-gray-300">›</span>
                    </Link>
                  </li>
                ) : (
                  <li key={i.label} className="flex items-center justify-between px-2 py-2 text-sm text-gray-400">
                    {i.label}
                    <span className="rounded bg-gray-100 px-1.5 text-[10px]">준비 중</span>
                  </li>
                ),
              )}
              {s.items.length === 0 && <li className="px-2 py-2 text-sm text-gray-400">메뉴 없음</li>}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
