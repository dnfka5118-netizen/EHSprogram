import { STATUS_LABEL } from "@/lib/labels";
import { DateRange } from "./DateRange";
import { LocationMultiSelect } from "./LocationMultiSelect";
import type { Department, Module, Site } from "@/lib/types";

// 조회 조건 : 상태 · (점검) · (사업장) · 부서 · 시행 일자(시작~끝) · 장소(여러 개)
export type Filters = { status: string; site: string; dept: string; from: string; to: string; locs: string[]; module: string };

export const STATUS_FILTERS = [
  { value: "open", label: "미완료 전체" },
  { value: "overdue", label: "기한 초과" },
  ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label: label === "종결" ? "완료(종결)" : label })),
  { value: "all", label: "전체" },
];

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const UUID = /^[0-9a-f-]{36}$/i;

export function readFilters(sp: Record<string, string | string[] | undefined>, defaults: Partial<Filters> = {}): Filters {
  let from = str(sp.from);
  let to = str(sp.to);
  // 예전 주소(?month=YYYY-MM) 도 그 달 1일~말일로
  const month = str(sp.month);
  if (!from && !to && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    from = `${month}-01`;
    to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }
  const locs = (Array.isArray(sp.loc) ? sp.loc : sp.loc ? [sp.loc] : []).filter((x) => UUID.test(x));
  return {
    status: str(sp.status) || defaults.status || "open",
    site: str(sp.site) || defaults.site || "",
    dept: str(sp.dept) || defaults.dept || "",
    from: isDate(from) ? from : "",
    to: isDate(to) ? to : "",
    locs,
    module: str(sp.module) || defaults.module || "",
  };
}

// 조회 조건이 한 달 안이면 그 달 (엑셀의 "당월 점검 현황" 표시용)
export function filterMonth(f: Filters): string | undefined {
  return f.from && f.to && f.from.slice(0, 7) === f.to.slice(0, 7) ? f.from.slice(0, 7) : undefined;
}

// 주소에 그대로 붙일 조회 조건 (부서 바꾸기 등에서 나머지 조건 유지)
export function filterParams(f: Filters, omit: (keyof Filters)[] = []): [string, string][] {
  const out: [string, string][] = [];
  for (const k of ["status", "site", "dept", "from", "to", "module"] as const) if (!omit.includes(k) && f[k]) out.push([k, f[k]]);
  if (!omit.includes("locs")) for (const l of f.locs) out.push(["loc", l]);
  return out;
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
  if (f.from) q = q.gte("inspection_date", f.from);
  if (f.to) q = q.lte("inspection_date", f.to);
  if (f.locs.length) q = q.in("location_id", f.locs);
  return q;
}

const dot = (d: string) => d.slice(2).replaceAll("-", ".");

export function describeFilters(f: Filters, sites: Site[], depts: Department[], modules: Module[] = [], locations: { id: string; name: string }[] = []): string {
  const parts = [STATUS_FILTERS.find((s) => s.value === f.status)?.label ?? "전체"];
  const month = filterMonth(f);
  if (month && f.from.endsWith("-01")) parts.push(`${month.slice(0, 4)}년 ${Number(month.slice(5))}월 점검`);
  else if (f.from || f.to) parts.push(`${f.from ? dot(f.from) : ""}~${f.to ? dot(f.to) : ""} 점검`);
  if (f.module) parts.push(modules.find((m) => m.code === f.module)?.name ?? "");
  if (f.dept) parts.push(depts.find((d) => d.id === f.dept)?.name ?? "");
  if (f.locs.length) {
    const names = locations.filter((l) => f.locs.includes(l.id)).map((l) => l.name);
    parts.push(names.length > 3 ? `${names.slice(0, 3).join("·")} 외 ${names.length - 3}곳` : names.join("·"));
  }
  if (f.site && sites.length > 1) parts.push(sites.find((s) => s.id === f.site)?.name ?? "");
  return parts.filter(Boolean).join(", ");
}

const SELECT = "rounded-md border border-gray-300 bg-white px-2 py-1.5";

export function FindingFilters({ filters, sites, departments, modules, locations = [], lockDept }: {
  filters: Filters;
  sites: Site[];
  departments: Department[];
  modules?: Module[];
  locations?: { id: string; name: string; site_id?: string }[];
  lockDept?: boolean;
}) {
  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? "";
  const depts = departments.filter((d) => d.is_active && !d.parent_id && (!filters.site || d.site_id === filters.site));
  const locs = locations.filter((l) => !filters.site || !l.site_id || l.site_id === filters.site);
  return (
    <form className="mb-4 grid grid-cols-2 items-center gap-2 md:flex md:flex-wrap">
      <select name="status" defaultValue={filters.status} className={SELECT} aria-label="상태">
        {STATUS_FILTERS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      {modules && (
        <select name="module" defaultValue={filters.module} className={SELECT} aria-label="점검">
          <option value="">전체 점검</option>
          {modules.map((m) => (
            <option key={m.code} value={m.code}>{m.name}</option>
          ))}
        </select>
      )}
      {sites.length > 1 && (
        <select name="site" defaultValue={filters.site} className={SELECT} aria-label="사업장">
          <option value="">전체 사업장</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      )}
      {!lockDept && (
        <select name="dept" defaultValue={filters.dept} className={SELECT} aria-label="부서">
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
      <DateRange from={filters.from} to={filters.to} />
      {locs.length > 0 && <LocationMultiSelect locations={locs} selected={filters.locs} />}
      <button className="rounded-md bg-gray-800 px-4 py-1.5 text-sm text-white">조회</button>
    </form>
  );
}
