import Link from "next/link";
import { notFound } from "next/navigation";
import { canViewDailyOverview, getModuleBySlug } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { FINDING_ROW_SELECT, enrichFindings } from "@/lib/finding-rows";
import { Card } from "@/components/ui";
import { FindingTable } from "@/components/FindingTable";
import { ExcelButton } from "@/components/ExcelButton";
import { ExcelImportButton } from "../ExcelImportButton";
import { findingRowsPage } from "../excel-actions";
import { getProfile } from "@/lib/auth";
import { FindingFilters, applyFindingFilters, describeFilters, filterMonth, readFilters, usedPairs } from "@/components/FindingFilters";
import { todayKst } from "@/lib/format";
import { pageRange, readPaging } from "@/lib/paging";
import { MyDaily } from "./DailyStatus";
import { DailyMine } from "./DailyMine";
import { DailyPlaces } from "./DailyPlaces";
import { DailyOverview } from "./DailyOverview";
import { ChemStatus } from "./ChemStatus";
import type { Department, FindingOverview, FindingType, Location, Site, SubLocation } from "@/lib/types";

// 관리감독자 일일점검 : 나의 점검 현황(일지) / 장소별 점검 현황(오늘 미실시 → 대신 점검) / 나의 지적사항(내가 점검하며 지적한 것) / 사업장(부서별) 지적사항
const DAILY_VIEWS = [
  { key: "mine", label: "나의 점검 현황" },
  { key: "places", label: "장소별 점검 현황" },
  { key: "my-findings", label: "나의 지적사항" },
  { key: "all", label: "사업장(부서별) 지적사항" },
  { key: "overview", label: "전체 현황" }, // 권한 받은 사람 · 관리자만
] as const;

export default async function InspectionModulePage({ params, searchParams }: PageProps<"/insp/[slug]">) {
  const { slug } = await params;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.level === "none") notFound();
  const sp = await searchParams;
  const filters = readFilters(sp);
  const isDaily = mod.code === "insp_daily";
  const staff = isDaily ? await canViewDailyOverview() : false; // 전체 현황 탭 : 환경설정 → 사용자·권한 '관리감독자 일일점검 전체 현황'
  const view = isDaily ? (DAILY_VIEWS.find((v) => v.key === sp.view && (v.key !== "overview" || staff))?.key ?? "mine") : "all";

  if (view === "overview") {
    return (
      <div className="space-y-4">
        <DailyTabs view={view} staff={staff} />
        <DailyOverview />
      </div>
    );
  }
  if (view === "places") {
    return (
      <div className="space-y-4">
        <DailyTabs view={view} staff={staff} />
        <DailyPlaces dept={typeof sp.dept === "string" ? sp.dept : undefined} />
      </div>
    );
  }
  if (view === "mine") {
    return (
      <div className="space-y-4">
        <DailyTabs view={view} staff={staff} />
        <MyDaily />
        <DailyMine ym={typeof sp.ym === "string" ? sp.ym : undefined} />
      </div>
    );
  }

  const supabase = await createClient();
  const profile = await getProfile();
  const paging = readPaging(sp); // 보이는 쪽만 DB 에서 (동시 접속 시 속도)
  let base = supabase.from("finding_overview").select(FINDING_ROW_SELECT, { count: "exact" }).eq("module_code", mod.code);
  if (view === "my-findings") base = base.eq("created_by", profile?.id ?? "");
  const query = applyFindingFilters(base, filters);
  const canImport = mod.level === "write" && !!profile?.site_id && !["insp_daily", "insp_chem"].includes(mod.code); // 일일점검은 현장 QR, 유해화학물질은 점검대장으로만
  const none = Promise.resolve({ data: [] as unknown[] });
  const [{ data: sites }, { data: depts }, { rows, total }, { data: impLocs }, { data: impTypes }, { data: locRows }, { data: usedRows }] = await Promise.all([
    supabase.from("sites").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("departments").select("*").order("sort_order"),
    query
      .order("inspection_date", { ascending: false })
      .order("seq")
      .range(...pageRange(paging))
      .then(async ({ data, count }) => ({ rows: await enrichFindings(supabase, (data ?? []) as unknown as FindingOverview[]), total: count ?? 0 })),
    // 엑셀로 추가 : 등록자 사업장의 장소·유형
    canImport ? supabase.from("locations").select("*, sub_locations(*)").eq("site_id", profile!.site_id!).eq("is_active", true) : none,
    canImport ? supabase.from("finding_types").select("*").eq("is_active", true) : none,
    supabase.from("locations").select("id, name, site_id").eq("is_active", true).order("sort_order"),
    // 장소 조건에는 지적사항이 나온 장소만 (부서별)
    supabase.rpc("finding_location_pairs", { p_modules: [mod.code] }),
  ]);
  const locList = (locRows ?? []) as { id: string; name: string; site_id: string }[];
  const siteList = (sites ?? []) as Site[];
  const deptList = (depts ?? []) as Department[];

  const condition = describeFilters(filters, siteList, deptList, [], locList);
  const title = view === "my-findings" ? "나의 지적사항" : isDaily ? "사업장(부서별) 지적사항" : "지적사항 현황";

  return (
    <div className="space-y-4">
      {isDaily && <DailyTabs view={view} staff={staff} />}
      <Card
        title={`${title} (${total}건)`}
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
              loadPage={findingRowsPage.bind(null, { module: mod.code, mine: view === "my-findings" }, filters)}
              title={`${mod.name} ${view === "my-findings" ? "나의 지적사항" : "현황"} (${condition})`}
              fileName={`${todayKst()}_${mod.name}_${view === "my-findings" ? "나의 지적사항" : "현황"}.xlsx`}
              currentMonth={filterMonth(filters)}
            />
          </div>
        }
      >
        {view === "my-findings" && <p className="mb-3 text-xs text-gray-500">내가 관리감독자 일일점검을 하며 지적한 건입니다.</p>}
        <FindingFilters filters={filters} sites={siteList} departments={deptList} locations={locList} used={usedPairs(usedRows)} hidden={{ ...(isDaily ? { view } : {}), ...(paging.size !== 20 ? { size: String(paging.size) } : {}) }} />
        <FindingTable rows={rows} server={{ total, ...paging }} />
      </Card>
      {mod.code === "insp_chem" && <ChemStatus />}
    </div>
  );
}

function DailyTabs({ view, staff }: { view: string; staff: boolean }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
      {DAILY_VIEWS.filter((v) => v.key !== "overview" || staff).map((v) => (
        <Link
          key={v.key}
          href={`/insp/daily?view=${v.key}`}
          className={`shrink-0 border-b-[3px] px-3 py-2.5 text-sm whitespace-nowrap ${
            view === v.key ? "border-brand-700 font-bold text-brand-800" : "border-transparent text-gray-600 hover:text-brand-800"
          }`}
        >
          {v.label}
        </Link>
      ))}
    </div>
  );
}
