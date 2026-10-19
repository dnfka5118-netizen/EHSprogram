import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { Card } from "@/components/ui";
import { fmtDateTime, todayKst } from "@/lib/format";

// 관리감독자 일일점검 : 오늘 관리감독자(담당 Area)별 점검 여부 · C·D형(QR 없음)은 [점검하기] · 이번 달 점검 일수 (내 구역 먼저)
export async function DailyStatus() {
  const supabase = await createClient();
  const me = await getProfile();
  const today = todayKst();
  const month0 = `${today.slice(0, 7)}-01`;
  const [{ data: areas }, { data: members }, { data: checks }] = await Promise.all([
    supabase.from("daily_areas").select("id, name, form_code, qr_token, area_text, departments(name), daily_forms(use_qr), daily_area_points(daily_points(name))").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("daily_area_members").select("area_id, user_id, profiles(name)"),
    supabase.from("daily_checks").select("area_id, check_date, submitted_at, is_backfill, profiles!daily_checks_user_id_fkey(name), sub:profiles!daily_checks_substitute_for_fkey(name)").gte("check_date", month0),
  ]);
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
  const canWrite = !!me; // 저장 권한은 DB 가 검사
  const doneToday = list.filter((a) => ck.some((c) => c.area_id === a.id && c.check_date === today)).length;

  return (
    <Card
      title={`오늘 관리감독자 점검 (${doneToday}/${list.length})`}
      actions={
        <Link href="/insp/daily/logs" className="text-sm text-brand-700 hover:underline">
          월간 일지 →
        </Link>
      }
    >
      <p className="mb-2 text-xs break-keep text-gray-500">A·B형은 담당 장소에 붙은 QR 을 휴대폰 카메라로 찍어서, C·D형은 [점검하기] 로 점검합니다. ★ = 내 점검</p>
      <ul className="divide-y divide-gray-100">
        {list.map((a) => {
          const t = ck.find((c) => c.area_id === a.id && c.check_date === today);
          const days = new Set(ck.filter((c) => c.area_id === a.id).map((c) => c.check_date)).size;
          const names = mem.filter((m) => m.area_id === a.id).map((m) => m.profiles?.name).join(", ");
          const noQr = a.daily_forms?.use_qr === false;
          const where = a.area_text || a.daily_area_points.map((x) => x.daily_points?.name).filter(Boolean).join(", ");
          return (
            <li key={a.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-1 py-2 text-sm ${mine.has(a.id) ? "bg-brand-50/40" : ""}`}>
              <span className="min-w-0 flex-1 basis-48">
                {mine.has(a.id) && <span className="mr-1 text-amber-500">★</span>}
                <b className="font-medium">{a.name}</b> <span className="text-xs text-gray-500">{a.form_code}형{a.departments ? ` · ${a.departments.name}` : ""}</span>
                <span className="block text-xs break-keep text-gray-500">{where || (names ? "" : "관리감독자 없음")}</span>
              </span>
              <span className="text-xs whitespace-nowrap">
                {t ? (
                  <span className="text-emerald-700">
                    ✓ {t.profiles?.name}
                    {t.sub ? ` (${t.sub.name} 대체)` : ""} {fmtDateTime(t.submitted_at).slice(-5)}
                  </span>
                ) : (
                  <span className="font-medium text-red-600">오늘 미실시</span>
                )}
              </span>
              <span className="text-xs whitespace-nowrap text-gray-500 tabular-nums">이번 달 {days}일</span>
              {noQr && canWrite && (
                <Link
                  href={`/d/${a.qr_token}`}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${mine.has(a.id) ? "bg-brand-800 text-white hover:bg-brand-900" : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
                >
                  {mine.has(a.id) ? (t ? "점검 수정" : "점검하기") : "대체 점검"}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
