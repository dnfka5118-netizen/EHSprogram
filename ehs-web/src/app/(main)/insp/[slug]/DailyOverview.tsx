import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { ScrollX } from "@/components/ScrollX";
import { AutoRefresh } from "@/components/AutoRefresh";
import { todayKst } from "@/lib/format";
import { ymLabel } from "@/lib/daily";
import { loadLogStatus, loadPlaceStatus } from "@/lib/daily-status";
import { logDeadline } from "@/lib/daily-report";

const TH = "border border-gray-200 px-2 py-2 font-medium whitespace-nowrap";
const TD = "border border-gray-200 px-2 py-2 text-center";
const LOG_LABEL: Record<string, [string, string]> = {
  draft: ["미제출", "font-semibold text-red-600"],
  rejected: ["반려", "text-red-600"],
  submitted: ["승인 대기", "text-amber-700"],
  approved: ["승인", "text-emerald-700"],
};

// 전체 현황 (안전관리자 · EHS팀) : 오늘 · 이번 달 미점검 + 부서별 제출 대상 달 일지 제출 · 승인 — 1분마다 자동 갱신
export async function DailyOverview() {
  const supabase = await createClient();
  const today = todayKst();
  // 일지 제출 대상 달 : 지난달 마감(다음 달 첫째 주 금요일) 전까지는 지난달, 지나면 이번 달
  const last = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10);
  const prev = today <= logDeadline(last) ? last : `${today.slice(0, 7)}-01`;
  const deadline = logDeadline(prev);
  const late = today > deadline;
  const [{ rows, teams }, logs] = await Promise.all([loadPlaceStatus(supabase, today), loadLogStatus(supabase, prev)]);
  // 그 달 말일 이전에 만든 구역만 그 달 일지 대상
  const prevEnd = new Date(Date.UTC(Number(prev.slice(0, 4)), Number(prev.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const logRows = rows.filter((r) => r.a.created_at.slice(0, 10) <= prevEnd).map((r) => ({ ...r, log: logs.get(r.a.id)?.status ?? "draft" }));

  const doneToday = rows.filter((r) => r.t).length;
  const missedAreas = rows.filter((r) => r.missed.length > 0);
  const missedDays = rows.reduce((s, r) => s + r.missed.length, 0);
  const cnt = (st: string) => logRows.filter((r) => r.log === st).length;
  const byTeam = teams.map(([id, name]) => {
    const rs = rows.filter((r) => r.teamId === id);
    const ls = logRows.filter((r) => r.teamId === id);
    const c = (st: string) => ls.filter((r) => r.log === st).length;
    return {
      id,
      name,
      areas: rs.length,
      done: rs.filter((r) => r.t).length,
      missed: rs.reduce((s, r) => s + r.missed.length, 0),
      approved: c("approved"),
      submitted: c("submitted"),
      rejected: c("rejected"),
      draft: c("draft"),
    };
  });
  const notToday = rows.filter((r) => !r.t).sort((p, q) => p.team.localeCompare(q.team, "ko") || p.who.localeCompare(q.who, "ko"));
  const worst = [...missedAreas].sort((p, q) => q.missed.length - p.missed.length || p.team.localeCompare(q.team, "ko"));
  const notSubmitted = logRows.filter((r) => r.log === "draft" || r.log === "rejected").sort((p, q) => p.team.localeCompare(q.team, "ko"));
  const due = deadline.slice(5).replace("-", ".");

  const tile = (label: string, value: string, sub: string, bad = false) => (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${bad ? "text-red-600" : "text-brand-800"}`}>{value}</p>
      <p className="mt-0.5 text-xs break-keep text-gray-500">{sub}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800">관리감독자 일일점검 실시간 전체 현황 · {today.replaceAll("-", ".")}</p>
        <AutoRefresh seconds={60} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tile("오늘 점검 실시", `${doneToday} / ${rows.length}`, `실시율 ${rows.length ? Math.round((doneToday / rows.length) * 100) : 0}%`)}
        {tile("오늘 미실시", `${rows.length - doneToday}곳`, "아래 명단에서 대신 점검", rows.length - doneToday > 0)}
        {tile("이번 달 미점검", `${missedDays}일`, `${missedAreas.length}곳 · 오늘 제외 지난 영업일`, missedDays > 0)}
        {tile(
          `${ymLabel(prev)} 일지 승인`,
          `${cnt("approved")} / ${logRows.length}`,
          `대기 ${cnt("submitted")} · 반려 ${cnt("rejected")} · 미제출 ${cnt("draft")} · 마감 ${due}${late ? " 지남" : ""}`,
          late && cnt("draft") + cnt("rejected") > 0,
        )}
      </div>

      <Card title="부서별 현황">
        <ScrollX>
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-brand-50 text-xs text-gray-700">
              <tr>
                <th rowSpan={2} className={TH}>부서</th>
                <th rowSpan={2} className={TH}>구역</th>
                <th colSpan={2} className={TH}>오늘</th>
                <th rowSpan={2} className={TH}>이번 달 미점검</th>
                <th colSpan={4} className={TH}>
                  {ymLabel(prev)} 일지 (마감 {due})
                </th>
              </tr>
              <tr>
                <th className={TH}>실시</th>
                <th className={TH}>미실시</th>
                <th className={TH}>승인</th>
                <th className={TH}>승인 대기</th>
                <th className={TH}>반려</th>
                <th className={TH}>미제출</th>
              </tr>
            </thead>
            <tbody>
              {byTeam.map((t) => (
                <tr key={t.id}>
                  <td className="border border-gray-200 px-2 py-2 font-medium">
                    <Link href={`/insp/daily?view=places&dept=${t.id}`} className="text-brand-800 hover:underline">
                      {t.name}
                    </Link>
                  </td>
                  <td className={TD}>{t.areas}</td>
                  <td className={`${TD} text-emerald-700`}>{t.done}</td>
                  <td className={`${TD} ${t.areas - t.done ? "font-semibold text-red-600" : ""}`}>{t.areas - t.done}</td>
                  <td className={`${TD} ${t.missed ? "text-red-600" : ""}`}>{t.missed ? `${t.missed}일` : "-"}</td>
                  <td className={`${TD} text-emerald-700`}>{t.approved}</td>
                  <td className={TD}>
                    {t.submitted ? (
                      <Link href={`/insp/daily/reports/${t.id}?ym=${prev.slice(0, 7)}`} className="font-semibold text-amber-700 underline">
                        {t.submitted}
                      </Link>
                    ) : (
                      0
                    )}
                  </td>
                  <td className={`${TD} ${t.rejected ? "text-red-600" : ""}`}>{t.rejected}</td>
                  <td className={`${TD} ${t.draft && late ? "font-bold text-red-700" : ""}`}>{t.draft}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollX>
        <p className="mt-2 text-xs text-gray-500">부서를 누르면 그 부서 장소별 현황, 승인 대기 숫자를 누르면 부서 레포트로 갑니다.</p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={`오늘 미실시 (${notToday.length}곳)`}>
          {notToday.length === 0 ? (
            <p className="text-sm text-emerald-700">모든 구역이 오늘 점검했습니다.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
              {notToday.map((r) => (
                <li key={r.a.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-sm">
                  <span className="w-20 shrink-0 text-xs text-gray-500">{r.team}</span>
                  <b className="font-medium">{r.who || "담당 미지정"}</b>
                  <span className="min-w-0 flex-1 basis-32 truncate text-xs text-gray-500" title={r.where}>
                    {r.where} · {r.a.form_code}형
                  </span>
                  {r.a.daily_forms?.use_qr === false ? (
                    <Link href={`/d/${r.a.qr_token}`} className="rounded border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
                      대신 점검
                    </Link>
                  ) : (
                    <span className="text-[11px] text-gray-400">현장 QR</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`이번 달 미점검 (${missedAreas.length}곳 · ${missedDays}일)`}>
          {worst.length === 0 ? (
            <p className="text-sm text-emerald-700">이번 달 빠진 날이 없습니다.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
              {worst.map((r) => (
                <li key={r.a.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-sm">
                  <span className="w-20 shrink-0 text-xs text-gray-500">{r.team}</span>
                  <b className="font-medium">{r.who || "담당 미지정"}</b>
                  <span className="font-semibold text-red-600">{r.missed.length}일</span>
                  <span className="min-w-0 flex-1 basis-32 text-xs text-gray-500">({r.missed.map((d) => Number(d.slice(8))).join(", ")}일)</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={`${ymLabel(prev)} 일지 미제출 · 반려 (${notSubmitted.length}명)`}>
        {notSubmitted.length === 0 ? (
          <p className="text-sm text-emerald-700">모두 제출했습니다.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {notSubmitted.map((r) => {
              const [label, cls] = LOG_LABEL[r.log];
              return (
                <li key={r.a.id} className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs" title={r.where}>
                  <span className="text-gray-500">{r.team}</span> <b className="font-medium text-gray-900">{r.who || r.a.name}</b> <span className={cls}>{label}</span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-gray-500">
          제출 마감 {deadline.replaceAll("-", ".")}(금){late ? " — 지났습니다" : ""} · 다른 달은{" "}
          <Link href={`/insp/daily/reports?ym=${prev.slice(0, 7)}`} className="text-brand-700 underline">
            부서 레포트 · 제출 현황
          </Link>
          에서 봅니다.
        </p>
      </Card>
    </div>
  );
}
