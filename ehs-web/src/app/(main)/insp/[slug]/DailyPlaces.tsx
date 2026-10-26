import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { Card } from "@/components/ui";
import { fmtDateTime, todayKst } from "@/lib/format";

type Area = {
  id: string;
  name: string;
  form_code: string;
  qr_token: string;
  area_text: string | null;
  created_at: string;
  departments: { id: string; name: string; parent_id: string | null } | null;
  daily_forms: { use_qr: boolean } | null;
  daily_area_points: { daily_points: { name: string } | null }[];
  daily_area_members: { profiles: { name: string } | null }[];
};
type Check = { area_id: string; check_date: string; submitted_at: string; profiles: { name: string } | null; sub: { name: string } | null };

// 장소별 점검 현황 : 구역(장소)마다 오늘 실시 여부 · 이번 달 미점검 영업일 → 안 된 곳은 대신 점검 (C·D형 바로, A·B형은 현장 QR)
export async function DailyPlaces({ dept: deptParam }: { dept?: string }) {
  const supabase = await createClient();
  const me = await getProfile();
  const today = todayKst();
  const month = `${today.slice(0, 7)}-01`;
  const [{ data: areas }, { data: checks }, { data: hol }, { data: myDept }, { data: allDepts }] = await Promise.all([
    supabase
      .from("daily_areas")
      .select(
        "id, name, form_code, qr_token, area_text, created_at, departments(id, name, parent_id), daily_forms(use_qr), daily_area_points(daily_points(name)), daily_area_members(profiles(name))",
      )
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("daily_checks")
      .select("area_id, check_date, submitted_at, profiles!daily_checks_user_id_fkey(name), sub:profiles!daily_checks_substitute_for_fkey(name)")
      .gte("check_date", month),
    supabase.from("holidays").select("day").gte("day", month).lte("day", today),
    me?.department_id ? supabase.from("departments").select("id, parent_id").eq("id", me.department_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("departments").select("id, name"),
  ]);
  const deptName = new Map((allDepts ?? []).map((d) => [d.id as string, d.name as string]));
  const list = (areas ?? []) as unknown as Area[];
  const ck = (checks ?? []) as unknown as Check[];
  const holidays = new Set((hol ?? []).map((h) => h.day as string));
  const teamOf = (a: Area) => (a.departments ? (a.departments.parent_id ?? a.departments.id) : "");
  const teamName = (a: Area) => (a.departments ? (deptName.get(teamOf(a)) ?? a.departments.name) : "-");
  const teams = [...new Map(list.filter((a) => a.departments).map((a) => [teamOf(a), teamName(a)])).entries()].sort((p, q) => p[1].localeCompare(q[1], "ko"));
  const myTeam = myDept ? ((myDept.parent_id as string | null) ?? (myDept.id as string)) : "";
  const dept = deptParam === "all" ? "" : deptParam || (teams.some(([id]) => id === myTeam) ? myTeam : "");

  // 이번 달 지난 영업일 (오늘 제외) 중 기록 없는 날
  const bizDays = (since: string) => {
    const out: string[] = [];
    for (let d = new Date(`${month}T00:00:00Z`); d.toISOString().slice(0, 10) < today; d = new Date(d.getTime() + 86400000)) {
      const s = d.toISOString().slice(0, 10);
      const dow = d.getUTCDay();
      if (s >= since && dow !== 0 && dow !== 6 && !holidays.has(s)) out.push(s);
    }
    return out;
  };
  const rows = list
    .filter((a) => !dept || teamOf(a) === dept)
    .map((a) => {
      const mine = ck.filter((c) => c.area_id === a.id);
      const days = new Set(mine.map((c) => c.check_date));
      const since = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(a.created_at));
      const missed = bizDays(since).filter((d) => !days.has(d));
      return {
        a,
        team: teamName(a),
        who: a.daily_area_members.map((m) => m.profiles?.name).filter(Boolean).join(", "),
        where: a.area_text || a.daily_area_points.map((x) => x.daily_points?.name).filter(Boolean).join(", ") || a.name,
        t: mine.find((c) => c.check_date === today),
        done: days.size,
        missed,
      };
    })
    .sort((x, y) => Number(!!x.t) - Number(!!y.t) || y.missed.length - x.missed.length || x.team.localeCompare(y.team, "ko"));
  const notToday = rows.filter((r) => !r.t).length;

  return (
    <Card title={`장소별 점검 현황 (오늘 미실시 ${notToday} / ${rows.length})`}>
      <form className="mb-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="view" value="places" />
        <select name="dept" defaultValue={dept || "all"} className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm" aria-label="부서">
          <option value="all">전체 부서</option>
          {teams.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
              {id === myTeam ? " (내 부서)" : ""}
            </option>
          ))}
        </select>
        <button className="rounded-md bg-gray-800 px-4 py-1.5 text-sm text-white">조회</button>
        <span className="text-xs break-keep text-gray-500">오늘 안 된 곳이 위에 나옵니다. 담당자가 휴가·외근이면 대신 점검해 주세요.</span>
      </form>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">구역이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map(({ a, team, who, where, t, done, missed }) => {
            const noQr = a.daily_forms?.use_qr === false;
            return (
              <li key={a.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-2 text-sm ${t ? "" : "bg-red-50/40"}`}>
                <span className="w-20 shrink-0 text-xs text-gray-500">{team}</span>
                <span className="min-w-0 flex-1 basis-48">
                  <b className="font-medium break-keep">{where}</b> <span className="text-xs text-gray-500">{a.form_code}형</span>
                  <span className="block text-xs text-gray-600">담당 {who || <span className="text-red-600">미지정</span>}</span>
                </span>
                <span className="text-xs whitespace-nowrap">
                  오늘{" "}
                  {t ? (
                    <span className="text-emerald-700">
                      ✓ {t.profiles?.name}
                      {t.sub ? ` (${t.sub.name} 대신)` : ""} {fmtDateTime(t.submitted_at).slice(-5)}
                    </span>
                  ) : (
                    <span className="font-semibold text-red-600">미실시</span>
                  )}
                </span>
                <span className="text-xs whitespace-nowrap text-gray-500" title={missed.map((d) => d.slice(5)).join(", ")}>
                  이번 달 {done}일{missed.length > 0 && <span className="text-red-600"> · 미점검 {missed.length}일 ({missed.map((d) => Number(d.slice(8))).join(", ")}일)</span>}
                </span>
                {!t &&
                  (noQr ? (
                    <Link href={`/d/${a.qr_token}`} className="rounded-md border border-amber-400 bg-amber-50 px-3 py-1 text-xs font-medium whitespace-nowrap text-amber-900 hover:bg-amber-100">
                      대신 점검
                    </Link>
                  ) : (
                    <span className="text-xs whitespace-nowrap text-gray-500">현장 QR 로 대신 점검</span>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
