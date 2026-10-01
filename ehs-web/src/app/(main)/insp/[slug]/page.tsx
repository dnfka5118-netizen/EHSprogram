import { notFound } from "next/navigation";
import { getModuleBySlug } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { FINDING_ROW_SELECT, enrichFindings } from "@/lib/finding-rows";
import { Card } from "@/components/ui";
import { FindingTable } from "@/components/FindingTable";
import { ExcelButton } from "@/components/ExcelButton";
import { FindingFilters, applyFindingFilters, describeFilters, readFilters } from "@/components/FindingFilters";
import { todayKst } from "@/lib/format";
import type { Department, FindingOverview, Site } from "@/lib/types";

export default async function InspectionModulePage({ params, searchParams }: PageProps<"/insp/[slug]">) {
  const { slug } = await params;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.level === "none") notFound();
  const filters = readFilters(await searchParams);

  const supabase = await createClient();
  const query = applyFindingFilters(supabase.from("finding_overview").select(FINDING_ROW_SELECT).eq("module_code", mod.code), filters);
  const [{ data: sites }, { data: depts }, rows] = await Promise.all([
    supabase.from("sites").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("departments").select("*").order("sort_order"),
    query
      .order("inspection_date", { ascending: false })
      .order("seq")
      .limit(500)
      .then(({ data }) => enrichFindings(supabase, (data ?? []) as unknown as FindingOverview[])),
  ]);
  const siteList = (sites ?? []) as Site[];
  const deptList = (depts ?? []) as Department[];

  const condition = describeFilters(filters, siteList, deptList);

  return (
    <div className="space-y-4">
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
