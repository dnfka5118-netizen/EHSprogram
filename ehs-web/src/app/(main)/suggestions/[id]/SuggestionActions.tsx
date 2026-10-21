"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, FormMessage, Textarea } from "@/components/ui";
import type { ActionState } from "@/lib/types";
import { SUGGESTION_STATUS, type SuggestionStatus } from "@/lib/suggestion";
import { addSuggestionComment, answerSuggestion, deleteSuggestion } from "../actions";

// EHS팀 처리 : 검토 중 / 수용(반영 계획) / 미수용(사유 필수) / 반영 완료(수용 건)
export function AnswerPanel({ id, status, answer }: { id: string; status: SuggestionStatus; answer: string | null }) {
  const router = useRouter();
  const [next, setNext] = useState<SuggestionStatus>(status === "submitted" ? "reviewing" : status === "accepted" ? "done" : status);
  const [text, setText] = useState(answer ?? "");
  const [state, setState] = useState<ActionState>();
  const [pending, start] = useTransition();
  const options: SuggestionStatus[] = ["reviewing", "accepted", "rejected", ...(status === "accepted" || status === "done" ? (["done"] as const) : [])];
  const need = next === "rejected" ? "미수용 사유 (작성자에게 보입니다)" : next === "accepted" ? "수용 답변 · 반영 계획 (작성자에게 보입니다)" : "답변 (선택)";

  return (
    <div className="space-y-3">
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        {options.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setNext(s)}
            className={`rounded-full border px-3 py-1.5 text-sm ${next === s ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 bg-white text-gray-700"}`}
          >
            {SUGGESTION_STATUS[s].label}
          </button>
        ))}
      </div>
      <div>
        <p className="mb-1 text-xs text-gray-600">{need}</p>
        <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={next === "rejected" ? "예: 법정 양식이라 항목을 줄일 수 없습니다." : ""} />
      </div>
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await answerSuggestion(id, next, text);
            setState(r);
            if (!r?.error) router.refresh();
          })
        }
      >
        {SUGGESTION_STATUS[next].label}(으)로 처리
      </Button>
    </div>
  );
}

export function CommentForm({ id }: { id: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [state, setState] = useState<ActionState>();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <FormMessage state={state?.error ? state : undefined} />
      <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="댓글 (질문·덧붙일 내용)" />
      <Button
        variant="secondary"
        disabled={pending || !text.trim()}
        onClick={() =>
          start(async () => {
            const r = await addSuggestionComment(id, text);
            setState(r);
            if (!r?.error) {
              setText("");
              router.refresh();
            }
          })
        }
      >
        댓글 남기기
      </Button>
    </div>
  );
}

export function DeleteSuggestion({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <>
      <Button
        variant="secondary"
        className="text-red-600"
        disabled={pending}
        onClick={() => {
          if (!confirm("이 의견을 삭제할까요? 되돌릴 수 없습니다.")) return;
          start(async () => {
            const r = await deleteSuggestion(id);
            if (r?.error) return setError(r.error);
            router.push("/suggestions");
            router.refresh();
          });
        }}
      >
        삭제
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </>
  );
}
