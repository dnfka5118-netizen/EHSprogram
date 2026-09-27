import Link from "next/link";
import { notFound } from "next/navigation";
import { getModuleBySlug } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { enrichFindings } from "@/lib/finding-rows";
import { Card } from "@/components/ui";
import { FindingTable } from "@/components/FindingTable";
import { ExcelButton } from "@/components/ExcelButton";
import { FindingFilters, applyFindingFilters, describeFilters, readFilters } from "@/components/FindingFilters";
import { fmtDate, todayKst } from "@/lib/format";
import type { Department, FindingOverview, Inspection, Site } from "@/lib/types";

export default async function InspectionModulePage({ params, searchParams }: PageProps<"/insp/[slug]">) {
  const { slug } = await params;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.level === "none") notFound();
  const filters = readFilters(await searchParams);

  const supabase = await createClient();
  const [{ data: sessions }, { data: sites }, { data: depts }] = await Promise.all([
    supabase.from("inspections").select("*").eq("module_code", mod.code).order("inspection_date", { ascending: false }).limit(12),
    supabase.from("sites").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("departments").select("*").order("sort_order"),
  ]);
  const siteList = (sites ?? []) as Site[];
  const deptList = (depts ?? []) as Department[];

  const query = applyFindingFilters(supabase.from("finding_overview").select("*").eq("module_code", mod.code), filters);
  const { data } = await query.order("inspection_date", { ascending: false }).order("seq").limit(500);
  const rows = await enrichFindings(supabase, (data ?? []) as FindingOverview[]);

  const siteName = (id: string) => siteList.find((s) => s.id === id)?.name ?? "";
  const condition = describeFilters(filters, siteList, deptList);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">{mod.name}</h1>
        <div className="flex gap-2">
          <Link href={`/insp/${slug}/report`} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">
            월별 보고서
          </Link>
          {mod.level === "write" && (
            <Link href={`/insp/${slug}/new`} className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-900">
              + 점검 등록
            </Link>
          )}
        </div>
      </div>

      <Card title="점검 회차">
        {(sessions ?? []).length === 0 ? (
          <p className="text-sm text-gray-500">등록된 점검이 없습니다.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {((sessions ?? []) as Inspection[]).map((s) => (
              <Link key={s.id} href={`/insp/${slug}/${s.id}`} className="shrink-0 rounded-md border border-gray-200 px-3 py-2 text-sm hover:border-emerald-700">
                <p className="font-medium text-gray-900">{s.title}</p>
                <p className="text-xs text-gray-500">
                  {siteName(s.site_id)} · {fmtDate(s.inspection_date)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card
        title={`지적사항 현황 (${rows.length}건)`}
        actions={
          <ExcelButton
            rows={rows}
            title={`${mod.name} 현황 (${condition})`}
            fileName={`${todayKst()}_${mod.name}_현황.xlsx`}
            currentMonth={filters.month || undefined}
          />
        }
      >
        <FindingFilters filters={filters} sites={siteList} departments={deptList} />
        <FindingTable rows={rows} />
        {rows.length >= 500 && <p className="mt-2 text-xs text-gray-500">최근 500건까지만 표시합니다. 조건을 좁혀 조회하세요.</p>}
      </Card>
    </div>
  );
}
