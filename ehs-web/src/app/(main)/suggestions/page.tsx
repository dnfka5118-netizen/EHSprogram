import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui";
import { fmtDate } from "@/lib/format";
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
      <PageHeader
        title="개선 의견"
        crumbs={[{ label: "공통" }, { label: "개선 의견" }]}
        actions={
          <Link href="/suggestions/new" className="rounded-md bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-900">
            의견 쓰기
          </Link>
        }
      >
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

      <Card
        title={`의견 ${rows.length}건`}
        actions={
          <Link href={href(status, !mine)} className={`rounded-full border px-3 py-1 text-xs ${mine ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 text-gray-700"}`}>
            내가 쓴 의견만
          </Link>
        }
      >
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">의견이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/suggestions/${r.id}`} className="flex items-start gap-3 py-3 hover:bg-brand-50/40">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold break-words text-gray-900">
                      <span className="mr-1 font-normal text-gray-400">#{r.no}</span>
                      {r.title}
                      {r.comments > 0 && <span className="ml-1 text-xs font-normal text-brand-700">💬{r.comments}</span>}
                      {r.photos > 0 && <span className="ml-1 text-xs font-normal text-gray-400">📷{r.photos}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {r.category} · {r.author_name} · {fmtDate(r.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${SUGGESTION_STATUS[r.status].style}`}>
                      {SUGGESTION_STATUS[r.status].label}
                    </span>
                    {(r.done_at || r.answered_at) && <p className="mt-0.5 text-[11px] text-gray-400">{fmtDate(r.done_at ?? r.answered_at)}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
