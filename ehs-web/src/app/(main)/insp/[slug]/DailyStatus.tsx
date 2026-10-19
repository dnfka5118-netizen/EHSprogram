import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { Card } from "@/components/ui";
import { fmtDateTime, todayKst } from "@/lib/format";

// 관리감독자 일일점검 : 오늘 구역별 점검 여부 · 이번 달 점검 일수 (내 구역 먼저)
export async function DailyStatus() {
  const supabase = await createClient();
  const me = await getProfile();
  const today = todayKst();
  const month0 = `${today.slice(0, 7)}-01`;
  const [{ data: areas }, { data: members }, { data: checks }] = await Promise.all([
    supabase.from("daily_areas").select("id, name, form_code, departments(name)").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("daily_area_members").select("area_id, user_id, profiles(name)"),
    supabase.from("daily_checks").select("area_id, check_date, submitted_at, profiles(name)").gte("check_date", month0),
  ]);
  type Area = { id: string; name: string; form_code: string; departments: { name: string } | null };
  type Check = { area_id: string; check_date: string; submitted_at: string; profiles: { name: string } | null };
  const mem = (members ?? []) as unknown as { area_id: string; user_id: string; profiles: { name: string } | null }[];
  const ck = (checks ?? []) as unknown as Check[];
  const mine = new Set(mem.filter((m) => m.user_id === me?.id).map((m) => m.area_id));
  const list = ((areas ?? []) as unknown as Area[]).sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id)));
  if (list.length === 0) {
    return (
      <Card title="오늘 구역별 점검">
        <p className="text-sm break-keep text-gray-500">
          아직 점검 구역이 없습니다. {me?.is_admin ? "환경설정 → 일일점검 구역에서 구역·담당자를 정하고 QR 을 인쇄해 붙여 주세요." : "EHS부서에서 구역을 등록하면 표시됩니다."}
        </p>
      </Card>
    );
  }
  const doneToday = list.filter((a) => ck.some((c) => c.area_id === a.id && c.check_date === today)).length;

  return (
    <Card
      title={`오늘 구역별 점검 (${doneToday}/${list.length})`}
      actions={
        <Link href="/insp/daily/logs" className="text-sm text-brand-700 hover:underline">
          월간 일지 →
        </Link>
      }
    >
      <p className="mb-2 text-xs break-keep text-gray-500">점검은 현장에 붙은 QR 을 휴대폰 카메라로 찍어서 합니다. ★ = 내 담당 구역</p>
      <ul className="divide-y divide-gray-100">
        {list.map((a) => {
          const t = ck.find((c) => c.area_id === a.id && c.check_date === today);
          const days = new Set(ck.filter((c) => c.area_id === a.id).map((c) => c.check_date)).size;
          const names = mem.filter((m) => m.area_id === a.id).map((m) => m.profiles?.name).join(", ");
          return (
            <li key={a.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-1 py-2 text-sm ${mine.has(a.id) ? "bg-brand-50/40" : ""}`}>
              <span className="min-w-0 flex-1 basis-48">
                {mine.has(a.id) && <span className="mr-1 text-amber-500">★</span>}
                <b className="font-medium">{a.name}</b> <span className="text-xs text-gray-500">{a.form_code}형{a.departments ? ` · ${a.departments.name}` : ""}</span>
                <span className="block text-xs break-keep text-gray-500">{names || "담당자 없음"}</span>
              </span>
              <span className="text-xs whitespace-nowrap">
                {t ? (
                  <span className="text-emerald-700">
                    ✓ {t.profiles?.name} {fmtDateTime(t.submitted_at).slice(-5)}
                  </span>
                ) : (
                  <span className="font-medium text-red-600">오늘 미실시</span>
                )}
              </span>
              <span className="text-xs whitespace-nowrap text-gray-500 tabular-nums">이번 달 {days}일</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
