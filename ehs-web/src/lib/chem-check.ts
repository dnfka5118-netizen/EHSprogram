import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChemCheck, ChemGroup, ChemItem, ChemPlace, ChemResult } from "./chem";

// 점검대장 한 장 : 점검 단위 · 장소 · 항목 · 표시 · 비고
//   고칠 수 있을 때 : 지금 사용 중인 항목·장소 + 이미 표시한 칸 · 결재 뒤(읽기) : 표시한 칸만 (나중에 장소를 바꿔도 기록 그대로)
export async function getChemCheck(supabase: SupabaseClient, id: string, editable = false): Promise<ChemCheck | null> {
  const { data: c } = await supabase
    .from("chem_checks")
    .select("*, chem_groups(*, departments(name)), profiles(name, departments!profiles_department_fk(name)), chem_results(item_id, place_id, result), chem_notes(item_id, note, finding_id)")
    .eq("id", id)
    .maybeSingle();
  if (!c) return null;
  const g = c.chem_groups as ChemGroup & { departments: { name: string } | null };
  const [{ data: items }, { data: places }, { data: members }] = await Promise.all([
    supabase.from("chem_items").select("*").order("sort_order"),
    supabase.from("chem_places").select("*").eq("group_id", g.id).order("sort_order"),
    supabase.from("chem_group_members").select("user_id").eq("group_id", g.id),
  ]);
  const res = (c.chem_results ?? []) as { item_id: string; place_id: string; result: ChemResult }[];
  const usedItems = new Set(res.map((r) => r.item_id));
  const usedPlaces = new Set(res.map((r) => r.place_id));
  const p = c.profiles as { name: string; departments: { name: string } | null } | null;
  return {
    id: c.id,
    group: { ...g, department: g.departments?.name ?? null },
    check_date: c.check_date,
    week_start: c.week_start,
    time_text: c.time_text,
    inspector: p ? { name: p.name, department: p.departments?.name ?? null } : null,
    saved_at: c.saved_at,
    sub_reason: c.sub_reason ?? null,
    items: ((items ?? []) as ChemItem[]).filter((i) => (editable || !usedItems.size ? i.is_active : false) || usedItems.has(i.id)),
    places: ((places ?? []) as ChemPlace[]).filter((x) => (editable || !usedPlaces.size ? x.is_active : false) || usedPlaces.has(x.id)),
    results: Object.fromEntries(res.map((r) => [`${r.item_id}|${r.place_id}`, r.result])),
    notes: Object.fromEntries(((c.chem_notes ?? []) as { item_id: string; note: string | null; finding_id: string | null }[]).map((n) => [n.item_id, { note: n.note, finding_id: n.finding_id }])),
    memberIds: (members ?? []).map((m) => m.user_id as string),
  };
}

// 결재 칸 : 점검자 · EHS(합의) · 해당 부서장
export function chemStamps(steps: { step_kind: string; status: string; approver_name: string | null; acted_at: string | null }[] | undefined) {
  const box = (label: string, kinds: string[]) => {
    const s = (steps ?? []).filter((x) => kinds.includes(x.step_kind) && x.status === "approved");
    const at = s.at(-1)?.acted_at;
    return { label, name: s.map((x) => x.approver_name ?? "").join(", "), date: at ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(at)) : "" };
  };
  return [box("점검자", ["담당"]), box("합의 (EHS)", ["검토", "협조"]), box("결재", ["승인", "확인"])];
}
