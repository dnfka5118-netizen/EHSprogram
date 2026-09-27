"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui";

export function LoginForm() {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="아이디 (회사 이메일)">
        <Input name="email" type="email" autoComplete="username" required placeholder="name@sypchem.co.kr" />
      </Field>
      <Field label="비밀번호">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full py-2.5" pendingText="로그인 중…">
        로그인
      </SubmitButton>
    </form>
  );
}
