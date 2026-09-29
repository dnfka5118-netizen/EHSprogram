import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getModuleAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { FINDING_ROW_SELECT, enrichFindings } from "@/lib/finding-rows";
import { Card } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
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

  // 기본 부서 = 내 부서 (없으면 부서 조건 없이 조회 후 첫 부서로 표시)
  const filters = readFilters(await searchParams, { dept: profile.department_id ?? "" });
  const codes = modules.map((m) => m.code);
  const query = applyFindingFilters(supabase.from("finding_overview").select(FINDING_ROW_SELECT), filters).in("module_code", codes);

  const [{ data: sites }, { data: depts }, rows, { data: allForDept }] = await Promise.all([
    supabase.from("sites").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("departments").select("*").order("sort_order"),
    query
      .order("inspection_date", { ascending: false })
      .order("seq")
      .limit(500)
      .then(({ data }) => enrichFindings(supabase, (data ?? []) as unknown as FindingOverview[])),
    // 점검 종류별 요약 (조회 조건 중 상태를 뺀 전체 기준)
    filters.dept
      ? supabase.from("finding_overview").select("module_code, status, is_overdue").eq("request_department_id", filters.dept).in("module_code", codes)
      : Promise.resolve({ data: [] as { module_code: string; status: string; is_overdue: boolean }[] }),
  ]);
  const siteList = (sites ?? []) as Site[];
  const deptList = (depts ?? []) as Department[];
  const dept = deptList.find((d) => d.id === filters.dept);
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
      <PageHeader
        title="부서별 점검 조치 현황"
        crumbs={[{ label: "공통" }, { label: "부서별 점검 조치 현황" }]}
        actions={
        <form className="flex gap-2">
          {/* 부서만 바꾸고 나머지 조건은 유지 */}
          <input type="hidden" name="status" value={filters.status} />
          {filters.module && <input type="hidden" name="module" value={filters.module} />}
          {filters.month && <input type="hidden" name="month" value={filters.month} />}
          <select name="dept" defaultValue={filters.dept} className="rounded-md border border-gray-300 bg-white px-3 py-2 font-medium">
            <option value="">전체 부서</option>
            {deptList
              .filter((d) => d.is_active)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {siteList.length > 1 ? `${siteName(d.site_id)} · ` : ""}
                  {d.name}
                </option>
              ))}
          </select>
          <button className="rounded-md bg-brand-800 px-4 py-2 text-sm text-white">보기</button>
        </form>
        }
      >
        <p className="pb-3 text-sm text-gray-500">모든 점검에서 우리 부서로 조치 요청된 지적사항을 한 번에 봅니다.</p>
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summary.map((s) => (
          <Link
            key={s.code}
            href={`/dept?dept=${filters.dept}&module=${s.code}&status=open`}
            className={`rounded-lg border bg-white p-4 hover:border-brand-700 ${filters.module === s.code ? "border-brand-700" : "border-gray-200"}`}
          >
            <p className="text-sm font-medium text-gray-900">{s.name}</p>
            <p className="mt-2 flex items-baseline gap-3 text-sm text-gray-600">
              <span>
                미완료 <b className="text-xl text-brand-800">{s.open}</b>
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
