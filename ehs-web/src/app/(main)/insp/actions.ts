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

export type NewInspection = {
  module: string;
  site: string;
  date: string;
  title: string;
  inspectors: string;
  note: string;
  findings: FindingPayload[];
};

// 점검 + 지적사항 여러 건을 한 번에 (DB 에서 하나의 트랜잭션 — 한 건이라도 실패하면 모두 취소)
export async function createInspectionWithFindings(input: NewInspection): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_inspection_with_findings", {
    p_module: input.module,
    p_site: input.site,
    p_date: input.date,
    p_title: input.title.trim(),
    p_inspectors: input.inspectors,
    p_note: input.note,
    p_findings: input.findings,
  });
  if (error) return { error: toMessage(error) };
  if (input.findings.length) after(() => processOutbox());
  revalidatePath("/", "layout");
  return { id: data as string };
}

export type NewFinding = {
  id: string;
  inspectionId: string;
  locationId: string | null;
  subLocationId: string | null;
  subLocationText: string | null;
  typeId: string | null;
  problem: string;
  departmentId: string;
  photos: string[];
};

export async function createFinding(input: NewFinding): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_finding", {
    p_id: input.id,
    p_inspection: input.inspectionId,
    p_location: input.locationId,
    p_sub_location: input.subLocationId,
    p_sub_location_text: input.subLocationText,
    p_type: input.typeId,
    p_problem: input.problem,
    p_department: input.departmentId,
    p_photos: input.photos,
  });
  if (error) return { error: toMessage(error) };
  after(() => processOutbox());
  revalidatePath("/", "layout");
  return { ok: true };
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
