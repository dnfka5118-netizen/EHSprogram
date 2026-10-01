"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { processOutbox } from "@/lib/mail";
import { createClient } from "@/lib/supabase/server";
import { toMessage } from "@/lib/errors";
import { thumbPathOf } from "@/lib/photo-path";
import type { ActionState } from "@/lib/types";
import type { FindingPayload } from "./FindingFields";

// 점검 등록 = 지적사항 1건. 사업장·점검일·점검자·회차는 DB(register_finding)가 정함
export async function registerFinding(module: string, inspectors: string, finding: FindingPayload): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_finding", { p_module: module, p_inspectors: inspectors, p_finding: finding });
  if (error) return { error: toMessage(error) };
  after(() => processOutbox());
  revalidatePath("/", "layout");
  return { id: data as string };
}

// 엑셀로 추가 : 지난 날짜로 1건 등록 (ref 가 같으면 DB 가 이중 등록을 막음)
export async function importFinding(module: string, date: string, finding: FindingPayload, ref: string): Promise<{ ok: true } | { error: string; duplicate?: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("register_finding_on", { p_module: module, p_date: date, p_inspectors: "", p_finding: finding, p_ref: ref });
  if (error) {
    const msg = toMessage(error);
    return { error: msg, duplicate: msg.includes("이미 등록된") };
  }
  return { ok: true };
}

// 엑셀로 추가를 마친 뒤 한 번 : 알림 발송 · 화면 갱신
export async function finishImport() {
  after(() => processOutbox());
  revalidatePath("/", "layout");
}

export async function deleteFinding(findingId: string, backTo: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_finding", { p_finding: findingId });
  if (error) return { error: toMessage(error) };
  const paths = (data as string[]) ?? [];
  if (paths.length) await supabase.storage.from("findings").remove([...paths, ...paths.map(thumbPathOf)]);
  revalidatePath("/", "layout");
  redirect(backTo);
}
