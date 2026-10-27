import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, DeleteSubmit, Input, SubmitButton } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ScrollX } from "@/components/ScrollX";
import { fmtDate, todayKst } from "@/lib/format";
import { saveHoliday, saveNotifySettings, saveReminderSettings } from "../actions";
import { NOTIFY_KINDS } from "@/lib/notify-kinds";

const STAGE: Record<string, { label: string; cls: string }> = {
  assign: { label: "담당자 미지정", cls: "bg-amber-100 text-amber-800" },
  plan: { label: "계획 미수립", cls: "bg-blue-100 text-blue-800" },
  due_soon: { label: "목표일 임박", cls: "bg-violet-100 text-violet-800" },
  overdue: { label: "목표일 지남", cls: "bg-red-100 text-red-700" },
  approve: { label: "종결 승인 대기", cls: "bg-emerald-100 text-emerald-800" },
};

const FIELDS: { key: string; label: string; unit: string; hint: string }[] = [
  { key: "assign_days", label: "조치담당자 미지정", unit: "영업일 지나면", hint: "→ 요청부서의 조치담당자 지정자 (없으면 종결 승인자 → 관리자)" },
  { key: "plan_days", label: "개선계획 미수립", unit: "영업일 지나면", hint: "→ 조치담당자 (담당자로 지정된 날부터)" },
  { key: "due_before_days", label: "개선 목표일", unit: "영업일 전부터", hint: "→ 조치담당자 (같은 목표일에 한 번, 0 = 당일)" },
  { key: "approve_days", label: "종결 승인 대기", unit: "영업일 지나면", hint: "→ 요청부서의 종결 승인자 (없으면 관리자)" },
  { key: "repeat_days", label: "다시 알림", unit: "영업일마다", hint: "처리될 때까지 같은 건을 반복해서 알리는 간격 (목표일 지난 조치 포함)" },
];

function Stage({ s }: { s: string }) {
  const v = STAGE[s] ?? { label: s, cls: "bg-gray-100 text-gray-700" };
  return <span className={`rounded px-1.5 py-0.5 text-xs whitespace-nowrap ${v.cls}`}>{v.label}</span>;
}

type PreviewRow = { stage: string; user_id: string; user_name: string; finding_id: string; label: string; target_date: string | null };

// 환경설정 → 알림 : 단계별 알림 기준(영업일) · 공휴일 · 오늘 보낼 알림 미리보기 · 보낸 기록
export default async function RemindersPage() {
  const supabase = await createClient();
  const year = Number(todayKst().slice(0, 4));
  const [{ data: setting }, { data: holidays }, { data: preview, error: pErr }, { data: log }, { data: mailSet }, { data: notifySet }] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "reminder").maybeSingle(),
    supabase.from("holidays").select("day, name").gte("day", `${year - 1}-01-01`).order("day"),
    supabase.rpc("preview_reminders"),
    supabase.from("reminder_log").select("id, sent_on, stage, target_date, finding_id, profiles(name)").order("id", { ascending: false }).limit(100),
    supabase.from("app_settings").select("value").eq("key", "mail").maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "notify").maybeSingle(),
  ]);
  const immediate = !!(mailSet?.value as { immediate?: boolean } | undefined)?.immediate; // 종류를 정하지 않았을 때 기본값 (0032)
  const notify = (notifySet?.value ?? {}) as { kinds?: Record<string, string>; stages?: Record<string, boolean>; daily_deadline?: boolean };
  const kinds = notify.kinds ?? {};
  const stages = notify.stages ?? {};
  const v = (setting?.value ?? {}) as Record<string, number>;
  const previewRows = (preview ?? []) as PreviewRow[];
  const groups = new Map<string, PreviewRow[]>();
  for (const r of previewRows) groups.set(r.user_id, [...(groups.get(r.user_id) ?? []), r]);
  const byPerson = [...groups.entries()]; // 사람별로 접어서 (누르면 펼침)
  const people = byPerson.length;

  return (
    <div className="space-y-4">
      <Card title="알림 종류별 메일 설정">
        <p className="mb-3 text-sm break-keep text-gray-600">
          일이 생겼을 때 가는 알림 메일을 종류마다 정합니다. <b>다음 영업일 아침 8시</b>는 사람마다 한 통으로 모아 보냅니다. 메일 설정과 상관없이 프로그램의
          &apos;내 할 일&apos;에는 바로 보입니다.
        </p>
        <ActionForm action={saveNotifySettings} className="space-y-3">
          <ul className="divide-y divide-gray-100">
            {NOTIFY_KINDS.map((k) => (
              <li key={k.key} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-sm font-medium sm:w-48 sm:shrink-0">{k.label}</span>
                <span className="text-xs break-keep text-gray-500 sm:flex-1">→ {k.to}</span>
                <select name={`kind_${k.key}`} defaultValue={kinds[k.key] ?? (immediate ? "immediate" : "digest")} className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm sm:w-56">
                  <option value="digest">다음 영업일 아침 8시 (모아서)</option>
                  <option value="immediate">바로</option>
                  <option value="off">보내지 않음</option>
                </select>
              </li>
            ))}
          </ul>
          <div className="rounded-md bg-gray-50 p-3">
            <p className="mb-2 text-sm font-medium">아침 8시 &apos;처리가 늦어진 건&apos; 알림 (기준 일수는 아래에서)</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {Object.entries(STAGE).map(([key, st]) => (
                <label key={key} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name={`stage_${key}`} defaultChecked={stages[key] !== false} className="h-4 w-4" />
                  {st.label}
                </label>
              ))}
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="daily_deadline" defaultChecked={notify.daily_deadline !== false} className="h-4 w-4" />
                관리감독자 일지 제출 마감 (2일 전·당일)
              </label>
            </div>
          </div>
          <SubmitButton>저장</SubmitButton>
        </ActionForm>
      </Card>

      <Card title="단계별 알림 기준 (영업일)">
        <p className="mb-3 text-sm break-keep text-gray-600">
          매일 아침 8시(영업일만)에 아래 기준을 넘긴 건을 <b>사람마다 한 통</b>으로 모아 이메일로 보냅니다. 토·일요일과 아래 공휴일은 영업일에서 빠집니다.
        </p>
        <ActionForm action={saveReminderSettings} className="space-y-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="flex flex-col gap-1 border-b border-gray-100 pb-2 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-sm font-medium sm:w-36 sm:shrink-0">{f.label}</span>
              <span className="flex items-center gap-1 text-sm">
                <Input name={f.key} type="number" min={f.key === "due_before_days" ? 0 : 1} max={30} defaultValue={v[f.key] ?? 2} className="w-16 text-right" />
                <span className="whitespace-nowrap">{f.unit}</span>
              </span>
              <span className="text-xs break-keep text-gray-500">{f.hint}</span>
            </div>
          ))}
          <SubmitButton>저장</SubmitButton>
        </ActionForm>
      </Card>

      <Card title={`공휴일 (${year - 1}년 ~)`}>
        <ActionForm action={saveHoliday} resetOnSuccess className="flex flex-wrap gap-2">
          <Input name="day" type="date" required className="w-40" />
          <Input name="name" placeholder="이름 (예 : 추석, 창립기념일)" className="min-w-0 flex-1 sm:max-w-xs" />
          <SubmitButton>추가</SubmitButton>
        </ActionForm>
        <ul className="mt-3 divide-y divide-gray-100">
          {(holidays ?? []).map((h) => (
            <li key={h.day}>
              <ActionForm action={saveHoliday} className="flex flex-wrap items-center gap-2 py-1">
                <input type="hidden" name="day" value={h.day} />
                <span className="w-24 text-sm tabular-nums">{fmtDate(h.day)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{h.name || "-"}</span>
                <DeleteSubmit what={`${fmtDate(h.day)} ${h.name}`} />
              </ActionForm>
            </li>
          ))}
          {(holidays ?? []).length === 0 && <li className="py-3 text-sm break-keep text-gray-500">등록된 공휴일이 없습니다. 법정 공휴일·대체공휴일·회사 휴무일을 넣어 주세요.</li>}
        </ul>
      </Card>

      <Card title={`오늘 보낼 알림 미리보기 (${people}명 · ${previewRows.length}건)`}>
        {pErr && <p className="text-sm text-red-600">{pErr.message}</p>}
        {previewRows.length === 0 ? (
          <p className="py-3 text-sm text-gray-500">오늘 기준으로 알릴 건이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {byPerson.map(([uid, items]) => (
              <li key={uid}>
                <details className="group py-1.5">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <b className="font-medium whitespace-nowrap">{items[0].user_name}</b>
                    <span className="text-xs text-gray-500">{items.length}건</span>
                    {Object.keys(STAGE)
                      .filter((s) => items.some((r) => r.stage === s))
                      .map((s) => (
                        <span key={s} className="flex items-center gap-0.5">
                          <Stage s={s} />
                          <span className="text-xs text-gray-600">{items.filter((r) => r.stage === s).length}</span>
                        </span>
                      ))}
                  </summary>
                  <ul className="mt-1 space-y-1 border-l-2 border-gray-100 pl-2">
                    {items.map((r, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-x-2 text-sm">
                        <Stage s={r.stage} />
                        {r.target_date && <span className="text-xs whitespace-nowrap text-gray-500">목표 {fmtDate(r.target_date)}</span>}
                        <Link href={`/findings/${r.finding_id}`} className="min-w-0 basis-full break-keep text-gray-700 hover:underline">
                          {r.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="보낸 알림 기록 (최근 100건)">
        <ScrollX>
          <table className="w-full min-w-[420px] text-sm">
            <thead className="border-b border-gray-200 text-left text-xs text-gray-500">
              <tr>
                <th className="px-2 py-2 font-medium">날짜</th>
                <th className="px-2 py-2 font-medium">받는 사람</th>
                <th className="px-2 py-2 font-medium">단계</th>
                <th className="px-2 py-2 font-medium">지적사항</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(log ?? []).map((l) => (
                <tr key={l.id}>
                  <td className="px-2 py-1.5 text-xs whitespace-nowrap text-gray-500">{fmtDate(l.sent_on)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{(l.profiles as unknown as { name: string } | null)?.name ?? "-"}</td>
                  <td className="px-2 py-1.5">
                    <Stage s={l.stage} />
                  </td>
                  <td className="px-2 py-1.5">
                    {l.finding_id ? (
                      <Link href={`/findings/${l.finding_id}`} className="text-brand-700 hover:underline">
                        보기{l.target_date ? ` (목표 ${fmtDate(l.target_date)})` : ""}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
              {(log ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-gray-500">
                    아직 보낸 알림이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ScrollX>
        <p className="mt-2 text-xs text-gray-500">메일 발송 결과(성공·실패)는 &quot;메일 발송&quot; 탭에서 확인합니다.</p>
      </Card>
    </div>
  );
}
