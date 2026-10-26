import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getApproval, APPROVAL_STATUS_LABEL } from "@/lib/approval";
import { getDailyLogFor, logStamps } from "@/lib/daily-log";
import { ymLabel } from "@/lib/daily";
import { todayKst } from "@/lib/format";
import { Card } from "@/components/ui";
import { ScrollX } from "@/components/ScrollX";
import { DailyLogSheet } from "@/components/DailyLogSheet";
import { OpenLogButton } from "./logs/OpenLogButton";

const shift = (ym: string, n: number) => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

// 나의 점검 현황 : 내 담당 구역의 이번 달(고른 달) 안전보건 관리감독자 일일업무일지 (월간 일지와 같은 모양)
export async function DailyMine({ ym: ymParam }: { ym?: string }) {
  const thisMonth = todayKst().slice(0, 7);
  const ym = ymParam && /^\d{4}-\d{2}$/.test(ymParam) && ymParam <= thisMonth ? ymParam : thisMonth;
  const me = await getProfile();
  const supabase = await createClient();
  const { data: mem } = await supabase.from("daily_area_members").select("area_id, daily_areas!inner(id, name, form_code, is_active, sort_order)").eq("user_id", me?.id ?? "");
  const areas = ((mem ?? []) as unknown as { daily_areas: { id: string; name: string; form_code: string; is_active: boolean; sort_order: number } }[])
    .map((m) => m.daily_areas)
    .filter((a) => a.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ko"));
  const { data: logs } = areas.length
    ? await supabase.from("daily_logs").select("id, area_id").eq("ym", `${ym}-01`).in("area_id", areas.map((a) => a.id))
    : { data: [] };
  const sheets = await Promise.all(
    areas.map(async (a) => {
      const logId = (logs ?? []).find((l) => l.area_id === a.id)?.id as string | undefined;
      const [d, approval] = await Promise.all([getDailyLogFor(supabase, a.id, `${ym}-01`), logId ? getApproval(supabase, "insp_daily", logId) : null]);
      return { a, logId, d, approval };
    }),
  );
  const nav = (m: string) => `/insp/daily?view=mine&ym=${m}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={nav(shift(ym, -1))} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50" aria-label="이전 달">
          ‹
        </Link>
        <b className="text-base">{ymLabel(`${ym}-01`)}</b>
        {ym < thisMonth && (
          <Link href={nav(shift(ym, 1))} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50" aria-label="다음 달">
            ›
          </Link>
        )}
        {ym !== thisMonth && (
          <Link href={nav(thisMonth)} className="text-sm text-brand-700 hover:underline">
            이번 달
          </Link>
        )}
      </div>

      {sheets.length === 0 && (
        <Card>
          <p className="text-sm break-keep text-gray-500">담당 구역이 없습니다. 환경설정 → 일일점검 구역에서 관리감독자로 지정되면 이곳에 내 일일업무일지가 보입니다.</p>
        </Card>
      )}

      {sheets.map(({ a, logId, d, approval }) => (
        <Card
          key={a.id}
          title={
            <span>
              {a.name} <span className="text-xs font-normal text-gray-500">{a.form_code}형</span>
            </span>
          }
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{approval ? APPROVAL_STATUS_LABEL[approval.status] : logId ? "작성 중" : "일지 미작성"}</span>
              {logId ? (
                <Link href={`/insp/daily/logs/${logId}`} className="rounded-md bg-brand-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-900">
                  일지 열기 · 상신
                </Link>
              ) : (
                <OpenLogButton areaId={a.id} ym={`${ym}-01`} />
              )}
            </div>
          }
        >
          {d ? (
            <>
              <p className="mb-2 text-xs text-gray-500 lg:hidden">원본 양식 크기 그대로입니다. 옆으로 밀어서 보세요.</p>
              <ScrollX>
                <div className="min-w-[1000px]">
                  <DailyLogSheet d={d} stamps={logStamps(approval)} />
                </div>
              </ScrollX>
            </>
          ) : (
            <p className="text-sm text-gray-500">일지를 불러오지 못했습니다.</p>
          )}
        </Card>
      ))}
    </div>
  );
}
