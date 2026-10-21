// 장소·세부장소 → 조치 요청 부서 자동 선택
//   세부장소 기본 부서 → 장소 기본 부서 (환경설정 → 장소) → 과거 기록 최다 부서 (세부장소 → 장소)

export type DeptStat = { location_id: string; sub_location_id: string | null; department_id: string; n: number };

type Loc = { id: string; default_department_id?: string | null; sub_locations: { id: string; default_department_id?: string | null }[] };

export type DeptPick = { deptId: string; from: "setting" | "history" };

function most(stats: DeptStat[], valid: Set<string>) {
  const c = new Map<string, number>();
  for (const s of stats) if (valid.has(s.department_id)) c.set(s.department_id, (c.get(s.department_id) ?? 0) + s.n);
  return [...c].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export function suggestDept(locations: Loc[], stats: DeptStat[], deptIds: string[], locationId: string, subId: string): DeptPick | null {
  const loc = locations.find((l) => l.id === locationId);
  if (!loc) return null;
  const valid = new Set(deptIds);
  const sub = loc.sub_locations.find((s) => s.id === subId);
  const set = sub?.default_department_id || loc.default_department_id;
  if (set && valid.has(set)) return { deptId: set, from: "setting" };
  const here = stats.filter((s) => s.location_id === locationId);
  const hist = (sub && most(here.filter((s) => s.sub_location_id === sub.id), valid)) || most(here, valid);
  return hist ? { deptId: hist, from: "history" } : null;
}

// 환경설정 화면용 : 장소(세부장소 없이)의 과거 기록 최다 부서
export function historyDept(stats: DeptStat[], locationId: string, subId?: string) {
  const all = new Set(stats.map((s) => s.department_id));
  const here = stats.filter((s) => s.location_id === locationId && (subId === undefined || s.sub_location_id === subId));
  return most(here, all);
}
