import { notFound } from "next/navigation";
import { getModuleBySlug } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { FINDING_ROW_SELECT, enrichFindings } from "@/lib/finding-rows";
import { Card } from "@/components/ui";
import { FindingTable } from "@/components/FindingTable";
import { ExcelButton } from "@/components/ExcelButton";
import { ExcelImportButton } from "../ExcelImportButton";
import { getProfile } from "@/lib/auth";
import { FindingFilters, applyFindingFilters, describeFilters, filterMonth, readFilters, usedPairs } from "@/components/FindingFilters";
import { todayKst } from "@/lib/format";
import type { Department, FindingOverview, FindingType, Location, Site, SubLocation } from "@/lib/types";

export default async function InspectionModulePage({ params, searchParams }: PageProps<"/insp/[slug]">) {
  const { slug } = await params;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.level === "none") notFound();
  const filters = readFilters(await searchParams);

  const supabase = await createClient();
  const query = applyFindingFilters(supabase.from("finding_overview").select(FINDING_ROW_SELECT).eq("module_code", mod.code), filters);
  const profile = await getProfile();
  const canImport = mod.level === "write" && !!profile?.site_id;
  const none = Promise.resolve({ data: [] as unknown[] });
  const [{ data: sites }, { data: depts }, rows, { data: impLocs }, { data: impTypes }, { data: locRows }, { data: usedRows }] = await Promise.all([
    supabase.from("sites").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("departments").select("*").order("sort_order"),
    query
      .order("inspection_date", { ascending: false })
      .order("seq")
      .limit(500)
      .then(({ data }) => enrichFindings(supabase, (data ?? []) as unknown as FindingOverview[])),
    // 엑셀로 추가 : 등록자 사업장의 장소·유형
    canImport ? supabase.from("locations").select("*, sub_locations(*)").eq("site_id", profile!.site_id!).eq("is_active", true) : none,
    canImport ? supabase.from("finding_types").select("*").eq("is_active", true) : none,
    supabase.from("locations").select("id, name, site_id").eq("is_active", true).order("sort_order"),
    // 장소 조건에는 지적사항이 나온 장소만 (부서별)
    supabase.from("findings").select("request_department_id, location_id").eq("module_code", mod.code).not("location_id", "is", null).range(0, 9999),
  ]);
  const locList = (locRows ?? []) as { id: string; name: string; site_id: string }[];
  const siteList = (sites ?? []) as Site[];
  const deptList = (depts ?? []) as Department[];

  const condition = describeFilters(filters, siteList, deptList, [], locList);

  return (
    <div className="space-y-4">
      <Card
        title={`지적사항 현황 (${rows.length}건)`}
        actions={
          <div className="flex gap-2">
            {canImport && (
              <ExcelImportButton
                moduleCode={mod.code}
                moduleName={mod.name}
                locations={((impLocs ?? []) as (Location & { sub_locations: SubLocation[] })[]).map((l) => ({ ...l, sub_locations: l.sub_locations.filter((x) => x.is_active) }))}
                types={(impTypes ?? []) as FindingType[]}
                departments={deptList.filter((d) => d.is_active && !d.parent_id && d.site_id === profile!.site_id)}
                today={todayKst()}
              />
            )}
            <ExcelButton
              rows={rows}
              title={`${mod.name} 현황 (${condition})`}
              fileName={`${todayKst()}_${mod.name}_현황.xlsx`}
              currentMonth={filterMonth(filters)}
            />
          </div>
        }
      >
        <FindingFilters filters={filters} sites={siteList} departments={deptList} locations={locList} used={usedPairs(usedRows)} />
        <FindingTable rows={rows} />
        {rows.length >= 500 && <p className="mt-2 text-xs text-gray-500">최근 500건까지만 표시합니다. 조건을 좁혀 조회하세요.</p>}
      </Card>
    </div>
  );
}
