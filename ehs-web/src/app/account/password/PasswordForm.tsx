"use client";

import { useActionState } from "react";
import { changePassword } from "./actions";
import { Field, FormMessage, Input, SubmitButton } from "@/components/ui";

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="현재 비밀번호">
        <Input name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="새 비밀번호" hint="8자 이상, 영문+숫자">
        <Input name="next" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="새 비밀번호 확인">
        <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full py-2.5">비밀번호 변경</SubmitButton>
    </form>
  );
}
