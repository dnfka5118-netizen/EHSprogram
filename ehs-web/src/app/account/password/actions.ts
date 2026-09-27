"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { toMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/types";

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireProfile();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) return { error: "새 비밀번호는 8자 이상이어야 합니다." };
  if (!/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) return { error: "새 비밀번호는 영문과 숫자를 함께 사용해야 합니다." };
  if (next !== confirm) return { error: "새 비밀번호가 서로 일치하지 않습니다." };
  if (next === current) return { error: "현재 비밀번호와 다른 비밀번호를 사용해 주세요." };

  const supabase = await createClient();
  const { error: authError } = await supabase.auth.signInWithPassword({ email: profile.email, password: current });
  if (authError) return { error: "현재 비밀번호가 올바르지 않습니다." };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: toMessage(error) };
  await supabase.rpc("mark_password_changed");

  redirect("/?pw=changed");
}
