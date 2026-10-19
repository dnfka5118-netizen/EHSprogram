import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { toMessage } from "@/lib/errors";
import { Card } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { DailyCheckForm } from "./DailyCheckForm";
import type { DailyChoose, DailyOpen } from "@/lib/daily";

// 현장 QR(장소) 또는 [점검하기](QR 없는 C·D형) → 관리감독자 일일점검
//   QR : 내 담당 Area 에 묶인 장소면 내 점검표 · 담당이 아니면 이 장소 담당자 중 누구 대신 점검할지 고름 (?a=담당 Area)
export default async function DailyQrPage({ params, searchParams }: PageProps<"/d/[token]">) {
  const { token } = await params;
  const { a } = await searchParams;
  const areaId = typeof a === "string" && /^[0-9a-f-]{36}$/.test(a) ? a : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("daily_open", { p_token: token, p_area: areaId });
  if (error) {
    return (
      <Card title="관리감독자 일일점검" className="mx-auto max-w-xl">
        <p className="text-sm break-keep text-red-700">{toMessage(error)}</p>
      </Card>
    );
  }

  if ((data as DailyChoose).choose) {
    const c = data as DailyChoose;
    return (
      <Card title={`📍 ${c.point}`} className="mx-auto max-w-xl">
        {c.areas.length === 0 ? (
          <p className="text-sm break-keep text-gray-700">이 장소에 지정된 관리감독자가 없습니다. EHS부서에 문의해 주세요.</p>
        ) : (
          <>
            <p className="mb-3 text-sm break-keep text-gray-700">
              이 장소의 담당 관리감독자가 아닙니다. 담당자가 휴가·외근 등으로 없어 <b>대신 점검</b>하는 경우, 누구 대신인지 골라 주세요.
            </p>
            <ul className="space-y-2">
              {c.areas.map((x) => (
                <li key={x.id}>
                  <Link href={`/d/${token}?a=${x.id}`} className="block rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm hover:bg-amber-100">
                    <b>{x.members ?? x.name}</b> 대신 점검 <span className="text-xs text-gray-600">({x.form_code}형)</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
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
        <h1 className="mt-0.5 text-lg font-bold break-keep text-brand-900">{d.point ? `📍 ${d.point}` : `📋 ${d.area.name}`}</h1>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-gray-500">점검일</dt>
          <dd>{fmtDate(d.today)}</dd>
          <dt className="text-gray-500">점검자</dt>
          <dd className="break-keep">{me?.name}</dd>
          <dt className="text-gray-500">관리감독자</dt>
          <dd className="break-keep">{d.members.join(", ") || "-"}</dd>
          <dt className="text-gray-500">담당 Area</dt>
          <dd className="break-keep">{d.area.label}</dd>
        </dl>
        {d.checked_at && (
          <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            오늘 {d.checked_by} 님이{d.substitute_for ? ` (${d.substitute_for} 님 대체)` : ""} {fmtDateTime(d.checked_at)} 에 저장했습니다. 고쳐서 다시 저장할 수 있습니다.
          </p>
        )}
        {!d.biz_day && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">오늘은 휴일입니다. 점검하면 기록은 남습니다.</p>}
      </Card>

      {d.is_member || (d.can_substitute && d.member_list.length > 0) ? (
        <DailyCheckForm
          mode={{ kind: "qr", token, scannedAt: new Date().toISOString(), areaId: areaId ?? d.area.id }}
          data={d}
          departments={(depts ?? []) as { id: string; name: string }[]}
        />
      ) : (
        <Card>
          <p className="text-sm break-keep text-gray-700">이 점검의 담당 관리감독자가 아니어서 점검할 수 없습니다. EHS부서에 문의해 주세요.</p>
          <Link href="/insp/daily" className="mt-3 inline-block text-sm text-brand-700 hover:underline">
            관리감독자 일일점검 현황으로 →
          </Link>
        </Card>
      )}
    </div>
  );
}
