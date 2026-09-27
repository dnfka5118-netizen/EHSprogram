import Link from "next/link";
import { notFound } from "next/navigation";
import { getModuleBySlug } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { FindingList } from "@/components/FindingList";
import { STATUS_LABEL } from "@/lib/labels";
import { fmtDate } from "@/lib/format";
import type { Department, FindingOverview, Inspection, Site } from "@/lib/types";

const STATUS_FILTERS = [
  { value: "open", label: "미종결 전체" },
  { value: "overdue", label: "기한 초과" },
  ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
  { value: "all", label: "전체" },
];

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function InspectionModulePage({ params, searchParams }: PageProps<"/insp/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.level === "none") notFound();

  const status = str(sp.status) || "open";
  const site = str(sp.site);
  const dept = str(sp.dept);
  const month = str(sp.month);

  const supabase = await createClient();
  let query = supabase.from("finding_overview").select("*").eq("module_code", mod.code);
  if (status === "open") query = query.neq("status", "closed");
  else if (status === "overdue") query = query.eq("is_overdue", true);
  else if (status !== "all") query = query.eq("status", status);
  if (site) query = query.eq("site_id", site);
  if (dept) query = query.eq("request_department_id", dept);
  if (/^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    query = query.gte("inspection_date", `${month}-01`).lt("inspection_date", end);
  }

  const [{ data: findings }, { data: sessions }, { data: sites }, { data: depts }] = await Promise.all([
    query.order("inspection_date", { ascending: false }).order("seq").limit(500),
    supabase.from("inspections").select("*").eq("module_code", mod.code).order("inspection_date", { ascending: false }).limit(12),
    supabase.from("sites").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("departments").select("*").eq("is_active", true).order("sort_order"),
  ]);

  const siteList = (sites ?? []) as Site[];
  const deptList = ((depts ?? []) as Department[]).filter((d) => !site || d.site_id === site);
  const siteName = (id: string) => siteList.find((s) => s.id === id)?.name ?? "";

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

      <Card title={`지적사항 (${findings?.length ?? 0}건)`}>
        <form className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
          <select name="status" defaultValue={status} className="rounded-md border border-gray-300 bg-white px-2 py-1.5">
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select name="site" defaultValue={site} className="rounded-md border border-gray-300 bg-white px-2 py-1.5">
            <option value="">전체 사업장</option>
            {siteList.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select name="dept" defaultValue={dept} className="rounded-md border border-gray-300 bg-white px-2 py-1.5">
            <option value="">전체 부서</option>
            {deptList.map((d) => (
              <option key={d.id} value={d.id}>
                {siteList.length > 1 ? `${siteName(d.site_id)} · ` : ""}
                {d.name}
              </option>
            ))}
          </select>
          <input type="month" name="month" defaultValue={month} className="rounded-md border border-gray-300 bg-white px-2 py-1.5" />
          <button className="rounded-md bg-gray-800 px-3 py-1.5 text-sm text-white">조회</button>
        </form>
        <FindingList items={(findings ?? []) as FindingOverview[]} />
      </Card>
    </div>
  );
}
