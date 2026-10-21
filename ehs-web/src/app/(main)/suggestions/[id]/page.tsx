import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { EVENT_LABEL, SUGGESTION_STATUS, type SuggestionDetail } from "@/lib/suggestion";
import { AnswerPanel, CommentForm, DeleteSuggestion } from "./SuggestionActions";

export default async function SuggestionPage({ params }: PageProps<"/suggestions/[id]">) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_suggestion", { p_id: id });
  const s = data as SuggestionDetail | null;
  if (!s) notFound();
  const urls = s.photos.length ? ((await supabase.storage.from("docs").createSignedUrls(s.photos, 3600)).data ?? []) : [];
  const st = SUGGESTION_STATUS[s.status];
  const answered = s.answer && (s.status === "accepted" || s.status === "rejected" || s.status === "done" || s.status === "reviewing");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={`개선 의견 #${s.no}`}
        crumbs={[{ label: "공통" }, { label: "개선 의견", href: "/suggestions" }, { label: `#${s.no}` }]}
        actions={
          <Link href="/suggestions" className="text-sm text-brand-700 underline">
            ← 목록
          </Link>
        }
      />

      <Card>
        <div className="mb-3 flex items-start gap-2">
          <h2 className="min-w-0 flex-1 text-lg font-bold break-words text-gray-900">{s.title}</h2>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${st.style}`}>{st.label}</span>
        </div>
        <p className="mb-4 text-xs text-gray-500">
          {s.category} · {s.author_name} · {fmtDateTime(s.created_at)}
          {s.updated_at !== s.created_at && " (수정됨)"}
        </p>
        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-gray-900">{s.body}</p>
        {urls.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {urls.map((u, i) =>
              u.signedUrl ? (
                <a key={i} href={u.signedUrl} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u.signedUrl} alt={`첨부 사진 ${i + 1}`} className="h-28 w-28 rounded-md border border-gray-200 object-cover" />
                </a>
              ) : null,
            )}
          </div>
        )}
        {(s.can_edit || s.can_delete) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
            {s.can_edit && (
              <Link href={`/suggestions/${s.id}/edit`} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-800 hover:bg-gray-50">
                ✎ 수정
              </Link>
            )}
            {s.can_delete && <DeleteSuggestion id={s.id} />}
            {s.can_edit && <span className="text-xs text-gray-500">EHS팀이 접수하기 전까지 수정·삭제할 수 있습니다.</span>}
          </div>
        )}
      </Card>

      <Card title="EHS팀 답변">
        {answered ? (
          <div className={`rounded-md p-3 ${s.status === "rejected" ? "bg-red-50" : "bg-brand-50"}`}>
            <p className="mb-1 text-xs font-medium text-gray-600">
              {st.label} · {s.answered_by_name ?? "EHS팀"} · {fmtDateTime(s.done_at ?? s.answered_at)}
            </p>
            <p className="text-sm break-words whitespace-pre-wrap text-gray-900">{s.answer}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">{s.status === "submitted" ? "EHS팀이 아직 접수하지 않았습니다." : "검토 중입니다."}</p>
        )}
        {s.can_answer && (
          <details className="mt-4 rounded-md border border-brand-200 p-3" open={s.status === "submitted" || s.status === "reviewing"}>
            <summary className="cursor-pointer text-sm font-semibold text-brand-900">EHS팀 처리</summary>
            <div className="pt-3">
              <AnswerPanel id={s.id} status={s.status} answer={s.answer} />
            </div>
          </details>
        )}
      </Card>

      <Card title={`댓글 ${s.comments.length}`}>
        {s.comments.length > 0 && (
          <ul className="mb-4 space-y-3">
            {s.comments.map((c) => (
              <li key={c.id} className="text-sm">
                <p className="text-xs text-gray-500">
                  <b className={c.is_ehs ? "text-brand-800" : "text-gray-800"}>{c.author_name}</b>
                  {c.is_ehs && <span className="ml-1 rounded bg-brand-100 px-1 text-[10px] text-brand-800">EHS</span>} · {fmtDateTime(c.created_at)}
                </p>
                <p className="mt-0.5 break-words whitespace-pre-wrap text-gray-900">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        <CommentForm id={s.id} />
      </Card>

      <Card title="처리 이력">
        <ul className="space-y-1 text-xs text-gray-600">
          {s.events.map((e, i) => (
            <li key={i}>
              {fmtDateTime(e.created_at)} · <b className="text-gray-800">{EVENT_LABEL[e.action] ?? e.action}</b>
              {e.actor_name && ` · ${e.actor_name}`}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
