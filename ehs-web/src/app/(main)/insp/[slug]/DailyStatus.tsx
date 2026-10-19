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
  departments: { name: string } | null;
  daily_forms: { use_qr: boolean } | null;
  daily_area_points: { daily_points: { name: string } | null }[];
};
type Check = { area_id: string; check_date: string; submitted_at: string; is_backfill: boolean; profiles: { name: string } | null; sub: { name: string } | null };

// 담당 Area · 담당자 · 이번 달 점검 기록 (현황표 · 내 일일점검 공용)
async function load() {
  const supabase = await createClient();
  const me = await getProfile();
  const today = todayKst();
  const [{ data: areas }, { data: members }, { data: checks }] = await Promise.all([
    supabase
      .from("daily_areas")
      .select("id, name, form_code, qr_token, area_text, departments(name), daily_forms(use_qr), daily_area_points(daily_points(name))")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase.from("daily_area_members").select("area_id, user_id, profiles(name)"),
    supabase
      .from("daily_checks")
      .select("area_id, check_date, submitted_at, is_backfill, profiles!daily_checks_user_id_fkey(name), sub:profiles!daily_checks_substitute_for_fkey(name)")
      .gte("check_date", `${today.slice(0, 7)}-01`),
  ]);
  const mem = (members ?? []) as unknown as { area_id: string; user_id: string; profiles: { name: string } | null }[];
  const ck = (checks ?? []) as unknown as Check[];
  const mine = new Set(mem.filter((m) => m.user_id === me?.id).map((m) => m.area_id));
  const list = (areas ?? []) as unknown as Area[];
  const todayOf = (id: string) => ck.find((c) => c.area_id === id && c.check_date === today);
  const daysOf = (id: string) => new Set(ck.filter((c) => c.area_id === id).map((c) => c.check_date)).size;
  const where = (a: Area) => a.area_text || a.daily_area_points.map((x) => x.daily_points?.name).filter(Boolean).join(", ");
  const names = (id: string) => mem.filter((m) => m.area_id === id).map((m) => m.profiles?.name).join(", ");
  return { me, list, mine, todayOf, daysOf, where, names };
}

function Done({ t }: { t: Check | undefined }) {
  return t ? (
    <span className="text-emerald-700">
      ✓ {t.profiles?.name}
      {t.sub ? ` (${t.sub.name} 대체)` : ""} {fmtDateTime(t.submitted_at).slice(-5)}
    </span>
  ) : (
    <span className="font-medium text-red-600">미실시</span>
  );
}

// 점검 지표 : 오늘 관리감독자별 실시 · 미실시 (미실시 먼저, 부서 → 이름 순)
export async function DailyStatusTable() {
  const { list, todayOf, daysOf, where, names } = await load();
  if (list.length === 0) return null;
  const rows = list
    .map((a) => ({ a, dept: a.departments?.name ?? "", who: names(a.id), t: todayOf(a.id) }))
    .sort((x, y) => Number(!!x.t) - Number(!!y.t) || x.dept.localeCompare(y.dept, "ko") || x.who.localeCompare(y.who, "ko"));
  const done = rows.filter((r) => r.t).length;
  return (
    <Card
      title={`오늘 관리감독자 일일점검 (실시 ${done} / ${rows.length})`}
      actions={
        <Link href="/insp/daily/logs" className="text-sm text-brand-700 hover:underline">
          월간 일지 →
        </Link>
      }
    >
      <p className="mb-2 text-xs text-gray-500">미실시가 위에 나옵니다. 지난 날의 미점검·소급·대체는 각 월간 일지에서 확인합니다.</p>
      <ul className="divide-y divide-gray-100">
        {rows.map(({ a, dept, who, t }) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-1 py-1.5 text-sm">
            <span className="w-24 shrink-0 text-xs text-gray-500">{dept}</span>
            <span className="min-w-0 flex-1 basis-40">
              <b className="font-medium">{who || a.name}</b> <span className="text-xs text-gray-500">{a.form_code}형</span>
              <span className="block truncate text-xs text-gray-500">{where(a)}</span>
            </span>
            <span className="text-xs whitespace-nowrap">
              <Done t={t} />
            </span>
            <span className="w-20 text-right text-xs whitespace-nowrap text-gray-500 tabular-nums">이번 달 {daysOf(a.id)}일</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// 관리감독자 일일점검 화면 : 내 점검 (C·D형 [점검하기]) · 다른 사람 대신 점검 (C·D형)
export async function MyDaily() {
  const { me, list, mine, todayOf, daysOf, where, names } = await load();
  const my = list.filter((a) => mine.has(a.id));
  const others = list.filter((a) => !mine.has(a.id) && a.daily_forms?.use_qr === false);
  if (my.length === 0 && others.length === 0) return null;
  return (
    <Card
      title="내 일일점검"
      actions={
        <Link href="/insp/daily/logs" className="text-sm text-brand-700 hover:underline">
          월간 일지 →
        </Link>
      }
    >
      {my.length > 0 ? (
        <ul className="divide-y divide-gray-100">
          {my.map((a) => {
            const t = todayOf(a.id);
            const noQr = a.daily_forms?.use_qr === false;
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
                <span className="min-w-0 flex-1 basis-40">
                  <b className="font-medium">{a.form_code}형</b> <span className="text-xs break-keep text-gray-600">{where(a)}</span>
                </span>
                <span className="text-xs whitespace-nowrap">
                  오늘 <Done t={t} />
                </span>
                <span className="text-xs whitespace-nowrap text-gray-500">이번 달 {daysOf(a.id)}일</span>
                {noQr ? (
                  <Link href={`/d/${a.qr_token}`} className="rounded-md bg-brand-800 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-white hover:bg-brand-900">
                    {t ? "점검 수정" : "점검하기"}
                  </Link>
                ) : (
                  <span className="text-xs text-gray-500">현장 QR 로 점검</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">{me?.name} 님은 일일점검 담당이 아닙니다.</p>
      )}
      {others.length > 0 && (
        <details className="mt-2 border-t border-gray-100 pt-2">
          <summary className="cursor-pointer text-sm text-gray-600">다른 사람 대신 점검 (C·D형 · 담당자 휴가·외근 시)</summary>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {others.map((a) => (
              <li key={a.id}>
                <Link href={`/d/${a.qr_token}`} className="inline-block rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs hover:bg-amber-100">
                  {names(a.id) || a.name} ({a.form_code}형) 대신
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-gray-500">A·B형은 그 장소 QR 을 찍으면 대신할 사람을 고를 수 있습니다.</p>
        </details>
      )}
    </Card>
  );
}
