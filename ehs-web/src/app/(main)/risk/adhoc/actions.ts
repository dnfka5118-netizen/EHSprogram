"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processOutbox } from "@/lib/mail";
import { toMessage } from "@/lib/errors";
import type { JsaForm } from "@/lib/jsa";

type Result = { error?: string; id?: string; message?: string };

export async function saveJsa(id: string | null, form: JsaForm): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_jsa", { p_id: id, p_data: form });
  if (error) return { error: toMessage(error) };
  revalidatePath("/risk/adhoc", "layout");
  return { id: data as string, message: "저장했습니다." };
}

export async function submitJsa(id: string | null, form: JsaForm, steps: { step_kind: string; label: string; approver_id: string }[]): Promise<Result> {
  const saved = await saveJsa(id, form);
  if (saved.error || !saved.id) return saved;
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_jsa", { p_id: saved.id, p_steps: steps });
  if (error) return { error: toMessage(error), id: saved.id };
  after(() => processOutbox());
  revalidatePath("/", "layout");
  return { id: saved.id, message: "상신했습니다." };
}

export async function deleteJsa(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_jsa", { p_id: id });
  if (error) return { error: toMessage(error) };
  revalidatePath("/risk/adhoc", "layout");
  redirect("/risk/adhoc");
}
