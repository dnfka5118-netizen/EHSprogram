import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { NameRow, ROWS_GRID } from "../NameRow";
import { saveLocation, saveSubLocation } from "../actions";
import type { Department, Location, Site, SubLocation } from "@/lib/types";
import { historyDept, type DeptStat } from "@/lib/location-dept";

type WithDept = { default_department_id: string | null };

// 기본 조치 부서 : 점검 등록 때 장소·세부장소를 고르면 이 부서가 자동 선택됨 (비우면 과거 기록 최다 부서)
function DeptSelect({ depts, value, auto }: { depts: Department[]; value: string | null; auto: string }) {
  return (
    <label className="flex items-center gap-1.5 pb-1 text-xs text-gray-500">
      <span className="shrink-0">기본 조치 부서</span>
      <select name="default_department_id" defaultValue={value ?? ""} className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-900">
        <option value="">{auto}</option>
        {depts.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
    </label>
  );
}

export default async function LocationsPage({ searchParams }: PageProps<"/settings/locations">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: sites } = await supabase.from("sites").select("*").order("sort_order");
  const siteList = (sites ?? []) as Site[];
  const siteId = (typeof sp.site === "string" && sp.site) || siteList[0]?.id || "";

  const { data: locs } = await supabase.from("locations").select("*, sub_locations(*)").eq("site_id", siteId).order("sort_order");
  const locations = (locs ?? []) as (Location & WithDept & { sub_locations: (SubLocation & WithDept)[] })[];
  const [{ data: deptRows }, { data: statRows }] = await Promise.all([
    supabase.from("departments").select("*").eq("site_id", siteId).eq("is_active", true).is("parent_id", null).order("sort_order"),
    supabase.rpc("location_dept_stats", { p_site: siteId }),
  ]);
  const depts = (deptRows ?? []) as Department[];
  const stats = (statRows ?? []) as DeptStat[];
  const deptName = (id?: string | null) => depts.find((d) => d.id === id)?.name;
  // 세부장소를 비워 두면 : 장소 기본 부서 → 세부장소 과거 최다 → 장소 과거 최다
  const subAuto = (l: WithDept & { id: string }, subId: string) => {
    if (l.default_department_id) return `자동 : 장소 기본 ${deptName(l.default_department_id)}`;
    const h = deptName(historyDept(stats, l.id, subId)) ?? deptName(historyDept(stats, l.id));
    return h ? `자동 : 과거 최다 ${h}` : "자동 : 과거 기록 없음";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {siteList.map((s) => (
          <Link
            key={s.id}
            href={`/settings/locations?site=${s.id}`}
            className={`rounded-full border px-3 py-1 text-sm ${s.id === siteId ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 bg-white"}`}
          >
            {s.name}
          </Link>
        ))}
      </div>

      <Card title="장소 추가">
        <div className="max-w-md">
          <NameRow action={saveLocation} hidden={{ site_id: siteId }} placeholder="장소명 (예: HBC-C3)" />
        </div>
      </Card>

      {locations.map((l) => (
        <Card key={l.id}>
          <div className="mb-2 max-w-md">
            <NameRow action={saveLocation} id={l.id} name={l.name} sortOrder={l.sort_order} isActive={l.is_active} bold deleteWarning="세부장소도 함께 삭제됩니다.">
              <DeptSelect depts={depts} value={l.default_department_id} auto={`자동 : ${deptName(historyDept(stats, l.id)) ? `과거 최다 ${deptName(historyDept(stats, l.id))}` : "과거 기록 없음"}`} />
            </NameRow>
          </div>
          <p className="mb-1 text-xs text-gray-500">세부장소 ({l.sub_locations.length})</p>
          <div className={ROWS_GRID}>
            {l.sub_locations
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((s) => (
                <NameRow key={s.id} action={saveSubLocation} id={s.id} name={s.name} sortOrder={s.sort_order} isActive={s.is_active}>
                  <DeptSelect depts={depts} value={s.default_department_id} auto={subAuto(l, s.id)} />
                </NameRow>
              ))}
            <NameRow action={saveSubLocation} hidden={{ location_id: l.id }} placeholder="세부장소 추가" />
          </div>
        </Card>
      ))}
    </div>
  );
}
