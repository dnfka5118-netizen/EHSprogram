"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processOutbox } from "@/lib/mail";
import { toMessage } from "@/lib/errors";
import { sopFromRow, type SopForm } from "@/lib/sop";

type Result = { error?: string; id?: string; message?: string };

// id = 화면에서 만든 문서 ID (새 문서도 사진을 먼저 올리기 위해 ID 를 미리 정함)
export async function saveSop(id: string, form: SopForm): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_sop", { p_id: id, p_data: form });
  if (error) return { error: toMessage(error) };
  revalidatePath("/sop", "layout");
  return { id: data as string, message: "저장했습니다." };
}

export async function submitSop(id: string, form: SopForm, steps: { step_kind: string; label: string; approver_id: string }[]): Promise<Result> {
  const saved = await saveSop(id, form);
  if (saved.error) return saved;
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_sop", { p_id: id, p_steps: steps });
  if (error) return { error: toMessage(error), id };
  after(() => processOutbox());
  revalidatePath("/", "layout");
  return { id, message: "상신했습니다." };
}

export async function deleteSop(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_sop", { p_id: id });
  if (error) return { error: toMessage(error) };
  const paths = (data ?? []) as string[];
  if (paths.length) await supabase.storage.from("docs").remove(paths);
  revalidatePath("/sop", "layout");
  redirect("/sop");
}

// 개정 : Rev.+1 새 문서를 만들고 사진을 새 문서 경로로 복사
export async function reviseSop(id: string) {
  const supabase = await createClient();
  const newId = randomUUID();
  const { error } = await supabase.rpc("revise_sop", { p_id: id, p_new: newId });
  if (error) return { error: toMessage(error) };
  const [{ data: oldRow }, { data: newRow }] = await Promise.all([
    supabase.from("sop_docs").select("steps").eq("id", id).maybeSingle(),
    supabase.from("sop_docs").select("*").eq("id", newId).maybeSingle(),
  ]);
  if (oldRow && newRow) {
    const form = sopFromRow(newRow);
    const oldSteps = sopFromRow({ steps: oldRow.steps }).steps;
    let copied = false;
    for (let i = 0; i < form.steps.length; i++) {
      for (const p of oldSteps[i]?.photos ?? []) {
        const to = `sop/${newId}/${p.split("/").pop()}`;
        const c = await supabase.storage.from("docs").copy(p, to);
        if (!c.error) {
          form.steps[i].photos.push(to);
          copied = true;
        }
      }
    }
    if (copied) await supabase.rpc("save_sop", { p_id: newId, p_data: form });
  }
  revalidatePath("/sop", "layout");
  redirect(`/sop/${newId}`);
}
