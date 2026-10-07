"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";
import type { ActionState } from "@/lib/types";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const BUTTON = {
  primary: "bg-brand-800 text-white hover:bg-brand-900 disabled:bg-brand-800/50",
  secondary: "bg-white text-gray-800 border border-gray-300 hover:bg-gray-50 disabled:opacity-50",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50",
  ghost: "text-gray-700 hover:bg-gray-100",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof BUTTON }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed",
        BUTTON[variant],
        className,
      )}
    />
  );
}

export function SubmitButton({
  children,
  pendingText = "처리 중…",
  confirmText,
  ...props
}: ComponentProps<typeof Button> & { pendingText?: string; confirmText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || props.disabled}
      {...props}
      onClick={(e) => {
        if (confirmText && !confirm(confirmText)) e.preventDefault();
        props.onClick?.(e);
      }}
    >
      {pending ? pendingText : children}
    </Button>
  );
}

// 행 삭제 버튼 : 같은 폼으로 intent=delete 를 보낸다
export function DeleteSubmit({ what, warning }: { what: string; warning?: string }) {
  return (
    <SubmitButton
      name="intent"
      value="delete"
      variant="ghost"
      pendingText="…"
      className="px-2 py-1.5 text-red-600 hover:bg-red-50"
      confirmText={`'${what}'을(를) 삭제할까요?${warning ? `\n${warning}` : ""}`}
    >
      삭제
    </SubmitButton>
  );
}

export function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
        {hint && <span className="ml-2 text-xs font-normal text-gray-500">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const INPUT = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 disabled:bg-gray-100";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cx(INPUT, className)} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={cx(INPUT, className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea rows={3} {...props} className={cx(INPUT, className)} />;
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-lg border border-gray-200 bg-white", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-3 sm:px-4">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm whitespace-pre-line text-red-700">{state.error}</p>;
  if (state.message) return <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p>;
  return null;
}

export { cx };
