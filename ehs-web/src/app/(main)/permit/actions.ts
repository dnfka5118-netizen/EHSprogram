"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processOutbox } from "@/lib/mail";
import { toMessage } from "@/lib/errors";
import type { PermitApply, PermitField } from "@/lib/permit";

type Result = { error?: string; id?: string; message?: string };

export async function savePermit(id: string | null, data: PermitApply): Promise<Result> {
  const supabase = await createClient();
  const { data: newId, error } = await supabase.rpc("save_permit", { p_id: id, p_data: data });
  if (error) return { error: toMessage(error) };
  revalidatePath("/permit", "layout");
  return { id: newId as string, message: "저장했습니다." };
}

export async function submitPermit(id: string | null, data: PermitApply, steps: { step_kind: string; label: string; approver_id: string }[]): Promise<Result> {
  const saved = await savePermit(id, data);
  if (saved.error || !saved.id) return saved;
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_permit", { p_id: saved.id, p_steps: steps });
  if (error) return { error: toMessage(error), id: saved.id };
  after(() => processOutbox());
  revalidatePath("/", "layout");
  return { id: saved.id, message: "상신했습니다." };
}

export async function savePermitField(id: string, field: PermitField): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_permit_field", { p_id: id, p_field: field });
  if (error) return { error: toMessage(error) };
  revalidatePath(`/permit/${id}`, "layout");
  revalidatePath("/permit");
  return { id, message: "현장 기록을 저장했습니다." };
}

export async function completePermit(id: string, field: PermitField): Promise<Result> {
  const saved = await savePermitField(id, field);
  if (saved.error) return saved;
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_permit", { p_id: id });
  if (error) return { error: toMessage(error), id };
  revalidatePath("/", "layout");
  return { id, message: "작업완료 처리했습니다." };
}

export type TbmInput = { tbm_dt: string; work_dt: string; work_name: string; content: string; place: string; leader: string; photo_path: string | null };

export async function savePermitTbm(id: string, data: TbmInput): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_permit_tbm", { p_id: id, p_data: data });
  if (error) return { error: toMessage(error) };
  revalidatePath("/permit", "layout");
  return { id, message: "TBM 실시 기록이 저장되었습니다." };
}

export async function deletePermit(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_permit", { p_id: id });
  if (error) return { error: toMessage(error) };
  revalidatePath("/permit", "layout");
  redirect("/permit");
}
