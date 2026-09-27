import { STATUS_LABEL } from "@/lib/labels";
import type { Department, Module, Site } from "@/lib/types";

export type Filters = { status: string; site: string; dept: string; month: string; module: string };

export const STATUS_FILTERS = [
  { value: "open", label: "미완료 전체" },
  { value: "overdue", label: "기한 초과" },
  ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label: label === "종결" ? "완료(종결)" : label })),
  { value: "all", label: "전체" },
];

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export function readFilters(sp: Record<string, string | string[] | undefined>, defaults: Partial<Filters> = {}): Filters {
  const month = str(sp.month);
  return {
    status: str(sp.status) || defaults.status || "open",
    site: str(sp.site) || defaults.site || "",
    dept: str(sp.dept) || defaults.dept || "",
    month: /^\d{4}-\d{2}$/.test(month) ? month : "",
    module: str(sp.module) || defaults.module || "",
  };
}

// Supabase 쿼리 빌더에 조건 적용
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFindingFilters<Q extends Record<string, any>>(query: Q, f: Filters): Q {
  let q = query;
  if (f.status === "open") q = q.neq("status", "closed");
  else if (f.status === "overdue") q = q.eq("is_overdue", true);
  else if (f.status !== "all") q = q.eq("status", f.status);
  if (f.site) q = q.eq("site_id", f.site);
  if (f.dept) q = q.eq("request_department_id", f.dept);
  if (f.module) q = q.eq("module_code", f.module);
  if (f.month) {
    const [y, m] = f.month.split("-").map(Number);
    q = q.gte("inspection_date", `${f.month}-01`).lt("inspection_date", new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10));
  }
  return q;
}

export function describeFilters(f: Filters, sites: Site[], depts: Department[], modules: Module[] = []): string {
  const parts = [STATUS_FILTERS.find((s) => s.value === f.status)?.label ?? "전체"];
  if (f.month) parts.push(`${f.month.slice(0, 4)}년 ${Number(f.month.slice(5))}월 점검`);
  if (f.module) parts.push(modules.find((m) => m.code === f.module)?.name ?? "");
  if (f.dept) parts.push(depts.find((d) => d.id === f.dept)?.name ?? "");
  if (f.site && sites.length > 1) parts.push(sites.find((s) => s.id === f.site)?.name ?? "");
  return parts.filter(Boolean).join(", ");
}

const SELECT = "rounded-md border border-gray-300 bg-white px-2 py-1.5";

export function FindingFilters({ filters, sites, departments, modules, lockDept }: {
  filters: Filters;
  sites: Site[];
  departments: Department[];
  modules?: Module[];
  lockDept?: boolean;
}) {
  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? "";
  const depts = departments.filter((d) => d.is_active && (!filters.site || d.site_id === filters.site));
  return (
    <form className="mb-4 grid grid-cols-2 gap-2 md:flex md:flex-wrap">
      <select name="status" defaultValue={filters.status} className={SELECT}>
        {STATUS_FILTERS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      {modules && (
        <select name="module" defaultValue={filters.module} className={SELECT}>
          <option value="">전체 점검</option>
          {modules.map((m) => (
            <option key={m.code} value={m.code}>{m.name}</option>
          ))}
        </select>
      )}
      {sites.length > 1 && (
        <select name="site" defaultValue={filters.site} className={SELECT}>
          <option value="">전체 사업장</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      )}
      {!lockDept && (
        <select name="dept" defaultValue={filters.dept} className={SELECT}>
          <option value="">전체 부서</option>
          {depts.map((d) => (
            <option key={d.id} value={d.id}>
              {sites.length > 1 ? `${siteName(d.site_id)} · ` : ""}
              {d.name}
            </option>
          ))}
        </select>
      )}
      {lockDept && <input type="hidden" name="dept" value={filters.dept} />}
      <input type="month" name="month" defaultValue={filters.month} className={SELECT} aria-label="점검 월" />
      <button className="rounded-md bg-gray-800 px-4 py-1.5 text-sm text-white">조회</button>
    </form>
  );
}
