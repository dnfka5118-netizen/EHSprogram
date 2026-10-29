"use client";

import { useState, useTransition } from "react";
import { deleteComment, editComment } from "../actions";
import { Button, Textarea } from "@/components/ui";

// 지시사항·코멘트 한 건 : 쓴 사람 본인 · 관리자는 수정/삭제 (0041)
export function CommentItem({
  findingId,
  comment,
  author,
  when,
  editedWhen,
  canEdit,
}: {
  findingId: string;
  comment: { id: string; body: string; is_directive: boolean };
  author: string;
  when: string;
  editedWhen: string | null;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const res = await editComment(findingId, comment.id, body);
      if (res?.error) setError(res.error);
      else { setError(""); setEditing(false); }
    });
  const remove = () => {
    if (!confirm("이 코멘트를 삭제할까요? 삭제한 내용은 처리 이력에 남습니다.")) return;
    start(async () => {
      const res = await deleteComment(findingId, comment.id);
      if (res?.error) alert(res.error);
    });
  };

  return (
    <li className={`rounded-md p-3 text-sm ${comment.is_directive ? "border border-red-200 bg-red-50" : "bg-gray-50"}`}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-xs text-gray-500">
          {comment.is_directive && <span className="mr-1 rounded bg-red-600 px-1.5 py-0.5 text-white">지시</span>}
          {author} · {when}
          {editedWhen && <span className="ml-1 text-gray-400">(수정됨 {editedWhen})</span>}
        </p>
        {canEdit && !editing && (
          <span className="flex shrink-0 gap-3 text-xs">
            <button type="button" disabled={pending} onClick={() => { setBody(comment.body); setEditing(true); }} className="text-blue-600 hover:underline disabled:opacity-50">
              수정
            </button>
            <button type="button" disabled={pending} onClick={remove} className="text-red-600 hover:underline disabled:opacity-50">
              {pending ? "삭제 중…" : "삭제"}
            </button>
          </span>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={Math.min(12, Math.max(3, body.split("\n").length + 1))} autoFocus />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={pending} onClick={() => { setEditing(false); setError(""); }}>
              취소
            </Button>
            <Button type="button" disabled={pending || !body.trim()} onClick={save}>
              {pending ? "저장 중…" : "저장"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-gray-800">{comment.body}</p>
      )}
    </li>
  );
}
