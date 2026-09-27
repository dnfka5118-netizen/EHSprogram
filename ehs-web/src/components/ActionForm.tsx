"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { FormMessage } from "./ui";
import type { ActionState } from "@/lib/types";

// 서버 액션 폼 + 결과 메시지. resetOnSuccess 이면 성공 시 입력값 초기화
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state && (
        <div className="mt-2 basis-full">
          <FormMessage state={state} />
        </div>
      )}
    </form>
  );
}
