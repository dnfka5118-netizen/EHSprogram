import Link from "next/link";
import { notFound } from "next/navigation";
import { getModuleBySlug } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { toMessage } from "@/lib/errors";
import { fmtDate } from "@/lib/format";
import { Card } from "@/components/ui";
import { DailyCheckForm } from "@/app/(main)/d/[token]/DailyCheckForm";
import type { DailyOpen } from "@/lib/daily";

// 월간 일지 → 빠진 날 소급 입력 (컴퓨터에서, QR 없이 · 사유 필수)
export default async function DailyBackfillPage({ params, searchParams }: PageProps<"/insp/[slug]/logs/[id]/backfill">) {
  const { slug, id } = await params;
  const { day } = await searchParams;
  const mod = await getModuleBySlug(slug);
  if (!mod || mod.code !== "insp_daily" || typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) notFound();
  const supabase = await createClient();
  const { data: log } = await supabase.from("daily_logs").select("id, area_id, ym").eq("id", id).maybeSingle();
  if (!log) notFound();
  const back = (
    <Link href={`/insp/daily/logs/${id}`} className="text-sm text-brand-700 hover:underline">
      ← 월간 일지
    </Link>
  );
  if (day.slice(0, 7) !== (log.ym as string).slice(0, 7)) {
    return (
      <Card title="소급 입력">
        <p className="text-sm text-red-700">이 일지의 달({(log.ym as string).slice(0, 7)})에 해당하는 날짜만 입력할 수 있습니다.</p>
        <div className="mt-3">{back}</div>
      </Card>
    );
  }
  const { data, error } = await supabase.rpc("daily_backfill_open", { p_area: log.area_id, p_day: day });
  if (error) {
    return (
      <Card title={`소급 입력 · ${fmtDate(day)}`}>
        <p className="text-sm break-keep text-red-700">{toMessage(error)}</p>
        <div className="mt-3">{back}</div>
      </Card>
    );
  }
  const d = data as DailyOpen;
  const { data: depts } = await supabase.from("departments").select("id, name").eq("is_active", true).is("parent_id", null).order("sort_order");

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      {back}
      <Card>
        <p className="text-xs text-gray-500">{d.form.name}</p>
        <h2 className="mt-0.5 text-lg font-bold break-keep text-brand-900">
          📍 {d.area.name} · {fmtDate(day)} 소급 입력
        </h2>
      </Card>
      <DailyCheckForm mode={{ kind: "backfill", areaId: log.area_id as string, day, logId: id }} data={d} departments={(depts ?? []) as { id: string; name: string }[]} />
    </div>
  );
}
