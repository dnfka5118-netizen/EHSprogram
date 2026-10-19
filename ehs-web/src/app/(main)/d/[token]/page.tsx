import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { toMessage } from "@/lib/errors";
import { Card } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { DailyCheckForm } from "./DailyCheckForm";
import type { DailyOpen } from "@/lib/daily";

// 현장 QR → 관리감독자 일일점검 (QR 을 찍어야만 열림 · 찍은 시각을 함께 저장)
export default async function DailyQrPage({ params }: PageProps<"/d/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("daily_open", { p_token: token });
  if (error) {
    return (
      <Card title="관리감독자 일일점검" className="mx-auto max-w-xl">
        <p className="text-sm break-keep text-red-700">{toMessage(error)}</p>
      </Card>
    );
  }
  const d = data as DailyOpen;
  const me = await getProfile();
  const { data: depts } = await supabase
    .from("departments")
    .select("id, name")
    .eq("is_active", true)
    .is("parent_id", null)
    .eq("site_id", me?.site_id ?? "")
    .order("sort_order");

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <Card>
        <p className="text-xs text-gray-500">
          {d.form.name} · {d.form.form_no}
        </p>
        <h1 className="mt-0.5 text-lg font-bold break-keep text-brand-900">📍 {d.area.name}</h1>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-gray-500">점검일</dt>
          <dd>{fmtDate(d.today)}</dd>
          <dt className="text-gray-500">점검자</dt>
          <dd className="break-keep">{me?.name}</dd>
          <dt className="text-gray-500">담당 관리감독자</dt>
          <dd className="break-keep">{d.members.join(", ") || "-"}</dd>
          {d.area.department && (
            <>
              <dt className="text-gray-500">구역 부서</dt>
              <dd>{d.area.department}</dd>
            </>
          )}
        </dl>
        {d.checked_at && (
          <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            오늘 {d.checked_by} 님이 {fmtDateTime(d.checked_at)} 에 저장했습니다. 고쳐서 다시 저장할 수 있습니다.
          </p>
        )}
        {!d.biz_day && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">오늘은 휴일입니다. 점검하면 기록은 남습니다.</p>}
      </Card>

      {d.is_member ? (
        <DailyCheckForm token={token} data={d} departments={(depts ?? []) as { id: string; name: string }[]} scannedAt={new Date().toISOString()} />
      ) : (
        <Card>
          <p className="text-sm break-keep text-gray-700">
            이 구역의 담당 관리감독자가 아니어서 점검할 수 없습니다. 담당 지정이 필요하면 EHS부서에 요청해 주세요.
          </p>
          <Link href="/insp/daily" className="mt-3 inline-block text-sm text-brand-700 hover:underline">
            관리감독자 일일점검 현황으로 →
          </Link>
        </Card>
      )}
    </div>
  );
}
