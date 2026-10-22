import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { SUGGESTION_STATUS, type SuggestionRow } from "@/lib/suggestion";

const TABS = [
  { key: "", label: "전체" },
  { key: "open", label: "처리 중" },
  { key: "accepted", label: "수용" },
  { key: "rejected", label: "미수용" },
  { key: "done", label: "반영 완료" },
] as const;

// 개선 의견 게시판 : 모두 공개 · 익명 작성자는 DB 함수에서 가림
export default async function SuggestionsPage({ searchParams }: PageProps<"/suggestions">) {
  const sp = await searchParams;
  const status = TABS.find((t) => t.key === sp.status)?.key ?? "";
  const mine = sp.mine === "1";
  await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_suggestions", { p_status: status || null, p_mine: mine });
  const rows = (data ?? []) as SuggestionRow[];
  const href = (s: string, m: boolean) => `/suggestions?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(m ? { mine: "1" } : {}) })}`;

  return (
    <div className="space-y-4">
      <PageHeader title="게시판 (개선 의견)" crumbs={[{ label: "공통" }, { label: "게시판 (개선 의견)" }]}>
        <div className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={href(t.key, mine)}
              className={`shrink-0 border-b-[3px] px-3 py-2.5 text-sm whitespace-nowrap ${
                status === t.key ? "border-brand-700 font-bold text-brand-800" : "border-transparent text-gray-600 hover:text-brand-800"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </PageHeader>

      <p className="text-sm break-keep text-gray-600">
        프로그램을 쓰면서 불편한 점·바라는 점을 자유롭게 적어 주세요. EHS팀이 검토해 <b>수용</b> 또는 <b>미수용(사유)</b>으로 답변드리고, 반영되면
        알려 드립니다.
      </p>

      {/* 게시판 : 오른쪽 위 글쓰기 · 제목 / 작성자 / 등록일 / 답변상태 (휴대폰에서는 제목 아래로 접힘) */}
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-sm text-gray-600">총 {rows.length}건</span>
        <Link href={href(status, !mine)} className={`rounded-md border px-3 py-1.5 text-xs ${mine ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 bg-white text-gray-700"}`}>
          내 글만
        </Link>
        <Link href="/suggestions/new" className="rounded-md border border-gray-400 bg-white px-4 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50">
          글쓰기
        </Link>
      </div>

      <div>
        <div className={`${GRID} hidden rounded-md bg-slate-100 py-2.5 text-center text-xs font-medium text-gray-600 md:grid`}>
          <span>제목</span>
          <span className="border-l border-gray-200">작성자</span>
          <span className="border-l border-gray-200">등록일</span>
          <span className="border-l border-gray-200">답변상태</span>
        </div>
        {rows.length === 0 ? (
          <p className="mt-2 rounded-md border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">글이 없습니다. 오른쪽 위 [글쓰기]로 의견을 올려 주세요.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {rows.map((r) => {
              const st = SUGGESTION_STATUS[r.status];
              const answered = r.done_at ?? r.answered_at;
              return (
                <li key={r.id}>
                  <Link
                    href={`/suggestions/${r.id}`}
                    className={`${GRID} items-center gap-y-1 rounded-md border border-gray-200 bg-white px-4 py-3.5 hover:border-brand-500 md:px-0 md:py-5`}
                  >
                    <p className="col-span-2 min-w-0 text-sm font-bold break-words text-gray-900 md:col-span-1 md:px-5">
                      {r.title}
                      {r.comments > 0 && <span className="ml-1.5 text-xs font-normal text-gray-500">💬 {r.comments}</span>}
                      {r.photos > 0 && <span className="ml-1.5 text-xs font-normal text-gray-500">📎 {r.photos}</span>}
                    </p>
                    <span className="col-start-1 row-start-2 min-w-0 text-xs text-gray-500 md:col-start-auto md:row-start-auto md:border-l md:border-gray-200 md:text-center md:text-sm">
                      {r.author_name}
                      <span className="md:hidden"> · {boardDate(r.created_at, true)}</span>
                    </span>
                    <span className="hidden border-l border-gray-200 text-center text-sm text-gray-500 md:block">{boardDate(r.created_at, true)}</span>
                    <span className="col-start-2 row-start-2 pl-2 text-right whitespace-nowrap md:col-start-auto md:row-start-auto md:border-l md:border-gray-200 md:pl-0 md:text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${st.style}`}>
                        {r.status === "done" ? "✓ " : ""}
                        {st.label}
                      </span>
                      {answered && <span className="ml-1 text-[11px] text-gray-500 md:mt-0.5 md:ml-0 md:block md:text-xs">{boardDate(answered, false)}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// 휴대폰 : 제목(한 줄 전체) / 작성자·등록일 + 답변상태,  PC : 제목 | 작성자 | 등록일 | 답변상태
const GRID = "grid grid-cols-[1fr_auto] md:grid-cols-[1fr_8rem_11rem_8rem]";

// 게시판 날짜 : 올해는 10-21(화) 16:26, 지난해는 2025-12-09(화) 17:09 / 답변일은 시각 없이
function boardDate(iso: string, withTime: boolean) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  const thisYear = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric" }).formatToParts(new Date()).find((x) => x.type === "year")?.value;
  const day = `${p.year === thisYear ? "" : `${p.year}-`}${p.month}-${p.day}(${p.weekday})`;
  return withTime ? `${day} ${p.hour}:${p.minute}` : day;
}
