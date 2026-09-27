import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { jsaFromRow } from "@/lib/jsa";
import { TbmForm } from "./TbmForm";

// 연결된 위험성평가 → TBM 내용 초안 (원본 도구와 같은 형식)
function suggest(steps: ReturnType<typeof jsaFromRow>["steps"]): string {
  return steps
    .map((s, i) => {
      const hz = s.hazards.filter((h) => h.type || h.content).map((h) => `${h.type}: ${h.content}`).join(" / ");
      return `${i + 1}. ${s.content}${hz ? ` — 위험요인: ${hz}` : ""}${s.safe ? `\n   → 안전조치: ${s.safe.replace(/\n/g, " ")}` : ""}`;
    })
    .join("\n");
}

export default async function TbmPage({ params }: PageProps<"/permit/[id]/tbm">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase.from("permits").select("id, permit_no, work_name, work_place, start_dt, managers, phase, risk_eval_id, jsa_evals(steps)").eq("id", id).maybeSingle();
  if (!p) notFound();
  const { data: tbm } = await supabase.from("permit_tbm").select("*").eq("permit_id", id).maybeSingle();
  const photoUrl = tbm?.photo_path ? (await supabase.storage.from("docs").createSignedUrl(tbm.photo_path, 3600)).data?.signedUrl ?? null : null;
  const jsa = p.jsa_evals as unknown as { steps: unknown } | null;
  const start = p.start_dt ? String(p.start_dt).replace(" ", "T").slice(0, 16) : "";
  const leader = (p.managers as { name?: string }[] | null)?.[0]?.name ?? "";

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <Link href={`/permit/${id}`} className="text-sm text-gray-600 hover:underline">
        ← {p.permit_no} · {p.work_name}
      </Link>
      {p.phase === "draft" ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">허가서가 발급된 뒤에 TBM을 기록할 수 있습니다.</p>
      ) : (
        <TbmForm
          permitId={id}
          start={start}
          savedAt={tbm?.saved_at ?? null}
          photoUrl={photoUrl}
          initial={{
            tbm_dt: tbm?.tbm_dt ? String(tbm.tbm_dt).replace(" ", "T").slice(0, 16) : "",
            work_dt: tbm?.work_dt ? String(tbm.work_dt).replace(" ", "T").slice(0, 16) : start,
            work_name: tbm?.work_name ?? p.work_name,
            content: tbm?.content ?? (jsa ? suggest(jsaFromRow({ steps: jsa.steps }).steps) : ""),
            place: tbm?.place ?? p.work_place ?? "",
            leader: tbm?.leader ?? leader,
            photo_path: tbm?.photo_path ?? null,
          }}
        />
      )}
    </div>
  );
}
