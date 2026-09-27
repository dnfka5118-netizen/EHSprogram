"use client";

import { useActionState, useEffect, useRef } from "react";
import { addComment } from "../actions";
import { FormMessage, SubmitButton, Textarea } from "@/components/ui";

export function CommentForm({ findingId }: { findingId: string }) {
  const [state, action] = useActionState(addComment, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <input type="hidden" name="finding" value={findingId} />
      <Textarea name="body" rows={2} placeholder="지시사항 또는 답변·코멘트 입력" required />
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" name="directive" className="h-4 w-4" />
          지시사항으로 등록
        </label>
        <SubmitButton variant="secondary">등록</SubmitButton>
      </div>
      {state?.error && <FormMessage state={state} />}
    </form>
  );
}
