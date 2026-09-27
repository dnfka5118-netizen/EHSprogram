import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getModuleAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { enrichFindings } from "@/lib/finding-rows";
import { Card } from "@/components/ui";
import { FindingTable } from "@/components/FindingTable";
import { ExcelButton } from "@/components/ExcelButton";
import { FindingFilters, applyFindingFilters, describeFilters, readFilters } from "@/components/FindingFilters";
import { todayKst } from "@/lib/format";
import type { Department, FindingOverview, Site } from "@/lib/types";

// 부서별 현황 : 점검 종류와 관계없이 한 부서로 조치 요청된 모든 지적사항
export default async function DepartmentStatusPage({ searchParams }: PageProps<"/dept">) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const modules = (await getModuleAccess()).filter((m) => m.is_enabled && m.form === "finding" && m.level !== "none");

  const [{ data: sites }, { data: depts }] = await Promise.all([
    supabase.from("sites").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("departments").select("*").order("sort_order"),
  ]);
  const siteList = (sites ?? []) as Site[];
  const deptList = (depts ?? []) as Department[];

  const filters = readFilters(await searchParams, { dept: profile.department_id ?? deptList[0]?.id ?? "" });
  const dept = deptList.find((d) => d.id === filters.dept);

  let query = applyFindingFilters(supabase.from("finding_overview").select("*"), filters);
  query = query.in("module_code", modules.map((m) => m.code));
  const { data } = await query.order("inspection_date", { ascending: false }).order("seq").limit(500);
  const rows = await enrichFindings(supabase, (data ?? []) as FindingOverview[]);

  // 점검 종류별 요약 (조회 조건 중 상태를 뺀 전체 기준)
  const { data: allForDept } = dept
    ? await supabase
        .from("finding_overview")
        .select("module_code, status, is_overdue")
        .eq("request_department_id", dept.id)
        .in("module_code", modules.map((m) => m.code))
    : { data: [] };
  const summary = modules.map((m) => {
    const list = (allForDept ?? []).filter((f) => f.module_code === m.code);
    return {
      ...m,
      total: list.length,
      open: list.filter((f) => f.status !== "closed").length,
      overdue: list.filter((f) => f.is_overdue).length,
    };
  });

  const siteName = (id: string) => siteList.find((s) => s.id === id)?.name ?? "";
  const title = `${dept?.name ?? ""} 점검 조치 현황 (${describeFilters({ ...filters, dept: "" }, siteList, deptList, modules)})`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">부서별 현황</h1>
          <p className="text-sm text-gray-500">모든 점검에서 우리 부서로 조치 요청된 지적사항을 한 번에 봅니다.</p>
        </div>
        <form className="flex gap-2">
          {/* 부서만 바꾸고 나머지 조건은 유지 */}
          <input type="hidden" name="status" value={filters.status} />
          {filters.module && <input type="hidden" name="module" value={filters.module} />}
          {filters.month && <input type="hidden" name="month" value={filters.month} />}
          <select name="dept" defaultValue={filters.dept} className="rounded-md border border-gray-300 bg-white px-3 py-2 font-medium">
            {deptList
              .filter((d) => d.is_active)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {siteList.length > 1 ? `${siteName(d.site_id)} · ` : ""}
                  {d.name}
                </option>
              ))}
          </select>
          <button className="rounded-md bg-emerald-800 px-4 py-2 text-sm text-white">보기</button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summary.map((s) => (
          <Link
            key={s.code}
            href={`/dept?dept=${filters.dept}&module=${s.code}&status=open`}
            className={`rounded-lg border bg-white p-4 hover:border-emerald-700 ${filters.module === s.code ? "border-emerald-700" : "border-gray-200"}`}
          >
            <p className="text-sm font-medium text-gray-900">{s.name}</p>
            <p className="mt-2 flex items-baseline gap-3 text-sm text-gray-600">
              <span>
                미완료 <b className="text-xl text-emerald-800">{s.open}</b>
              </span>
              {s.overdue > 0 && (
                <span className="text-red-600">
                  기한초과 <b className="text-lg">{s.overdue}</b>
                </span>
              )}
              <span className="ml-auto text-xs text-gray-400">전체 {s.total}</span>
            </p>
          </Link>
        ))}
      </div>

      <Card
        title={`${dept?.name ?? ""} 지적사항 (${rows.length}건)`}
        actions={<ExcelButton rows={rows} title={title} showModule fileName={`${todayKst()}_${dept?.name ?? "부서"}_점검조치현황.xlsx`} />}
      >
        <FindingFilters filters={filters} sites={siteList} departments={deptList} modules={modules} lockDept />
        <FindingTable rows={rows} showModule />
      </Card>
    </div>
  );
}
