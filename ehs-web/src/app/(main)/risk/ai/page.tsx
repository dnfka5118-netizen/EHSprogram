import Link from "next/link";
import { getModuleAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { riskColor, riskOf, riskTextColor } from "@/lib/jsa";
import { draftFromSop, REF_SOURCES, sopQuery, type RefSource, type RiskRef } from "@/lib/risk-ref";
import type { SopStep } from "@/lib/sop";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const LIMIT: Record<RefSource, number> = { jsa: 8, ext: 5, sif: 8 };
const group = (g: string | null) => (g ?? "").replace(/^\d+\.\s*/, "");
const TAB = "rounded-md border px-3 py-1.5 text-sm";

export default async function RiskAiPage({ searchParams }: PageProps<"/risk/ai">) {
  const sp = await searchParams;
  const mode = str(sp.mode) === "sop" ? "sop" : "name";
  const q = str(sp.q).trim().slice(0, 200);
  const sopId = str(sp.sop);
  const canWrite = (await getModuleAccess()).find((m) => m.code === "risk_adhoc")?.level === "write";
  const supabase = await createClient();

  const [{ data: counts }, { data: sops }, { data: sop }] = await Promise.all([
    supabase.rpc("risk_ref_counts"),
    mode === "sop"
      ? supabase.from("sop_overview").select("id, sop_no, rev, title, department_name").eq("superseded", false).order("department_name").order("sop_no").limit(500)
      : Promise.resolve({ data: [] }),
    mode === "sop" && sopId ? supabase.from("sop_docs").select("id, sop_no, rev, title, process_name, steps").eq("id", sopId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const count = Object.fromEntries(((counts ?? []) as { source: string; n: number }[]).map((c) => [c.source, Number(c.n)]));
  const sopSteps = (sop?.steps ?? []) as SopStep[];
  const query = mode === "sop" ? (sop ? sopQuery(sop.title, sop.process_name, sopSteps) : "") : q;

  const results = query
    ? await Promise.all(
        REF_SOURCES.map(async (s) => {
          const { data, error } = await supabase.rpc("search_risk_refs", { p_q: query, p_source: s.key, p_limit: s.key === "sif" ? LIMIT.sif : 15 });
          return { ...s, error: error?.message, rows: (data ?? []) as RiskRef[] };
        }),
      )
    : [];
  const draft =
    sop && results.length
      ? draftFromSop(
          sopSteps,
          results.flatMap((r) => r.rows),
        )
      : [];

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          <Link href="/risk/ai" className={`${TAB} ${mode === "name" ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 bg-white"}`}>
            작업명으로 찾기
          </Link>
          <Link href="/risk/ai?mode=sop" className={`${TAB} ${mode === "sop" ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 bg-white"}`}>
            표준운전절차서로 찾기
          </Link>
        </div>
        <form className="flex flex-wrap gap-2">
          {mode === "sop" ? (
            <>
              <input type="hidden" name="mode" value="sop" />
              <select name="sop" defaultValue={sopId} required className="min-w-0 flex-1 basis-full rounded-md border border-gray-300 bg-white px-2 py-1.5 sm:basis-auto">
                <option value="">절차서 선택</option>
                {(sops ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {[s.department_name, s.sop_no && `${s.sop_no} Rev.${s.rev}`, s.title].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <input
              name="q"
              defaultValue={q}
              required
              placeholder="작업명 (예: 이동식 크레인 인양, 펌프 분해 점검)"
              className="min-w-0 flex-1 basis-full rounded-md border border-gray-300 px-2 py-1.5 sm:basis-auto"
            />
          )}
          <button className="rounded-md bg-gray-800 px-4 py-1.5 text-sm text-white">찾기</button>
        </form>
        <p className="mt-2 text-xs text-gray-500">
          참고 자료 : 우리 JSA {count.jsa ?? 0}건 · 타사 참고 {count.ext ?? 0}건 · 공단 SIF {count.sif ?? 0}건
          {!(count.jsa || count.ext || count.sif) && " — 아직 자료를 넣지 않았습니다 (관리자 : scripts/import-risk-refs.mjs)"}
        </p>
        {mode === "sop" && (sops ?? []).length === 0 && <p className="mt-2 text-sm text-gray-500">볼 수 있는 표준운전절차서가 없습니다.</p>}
      </Card>

      {sop && (
        <Card
          title={`절차서 단계별 초안 (${draft.length}단계)`}
          actions={
            canWrite &&
            draft.length > 0 && (
              <Link href={`/risk/adhoc/new?sop=${sop.id}`} className="rounded-md bg-brand-800 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900">
                이 초안으로 새 JSA 작성
              </Link>
            )
          }
        >
          {draft.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">절차서에 작업 단계가 없습니다.</p>
          ) : (
            <ol className="space-y-3">
              {draft.map((d, i) => (
                <li key={i} className="rounded-md border border-gray-200 p-3">
                  <p className="text-sm font-medium break-words whitespace-pre-line">
                    {i + 1}. {d.content}
                  </p>
                  <HazardList hazards={d.hazards} />
                  <p className="mt-1 text-xs break-words text-gray-500">
                    {d.from
                      ? `비슷한 과거 단계 : ${d.from.title} › ${d.from.step} (${REF_SOURCES.find((s) => s.key === d.from?.source)?.label} · 겹침 ${d.from.match}%)`
                      : "비슷한 과거 단계 없음 — 절차서의 유해위험요인만"}
                  </p>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-3 text-xs text-gray-500">빈도·강도는 우리 JSA 에서 가져온 것만 채워집니다. 새 JSA 화면에서 현장에 맞게 고친 뒤 상신하세요.</p>
        </Card>
      )}

      {results.map((r) => (
        <Card key={r.key} title={`${r.label} (${Math.min(r.rows.length, LIMIT[r.key])}건)`}>
          <p className="mb-2 text-xs text-gray-500">{r.note}</p>
          {r.error ? (
            <p className="text-sm text-red-600">불러오지 못했습니다 : {r.error}</p>
          ) : r.rows.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">비슷한 자료가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {r.rows.slice(0, LIMIT[r.key]).map((ref) => (
                <li key={ref.id} className="py-1">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5">
                      <span className="text-gray-400 group-open:rotate-90">›</span>
                      <span className="min-w-0 font-medium break-words">{ref.title || "(작업명 없음)"}</span>
                      <span className="text-xs text-gray-500">
                        {[
                          ref.source === "sif" ? ref.meta.origin : group(ref.group_name),
                          ref.area,
                          ref.year && `${ref.year}년`,
                          Number(ref.meta.repeat) > 1 && `${ref.meta.repeat}회 평가`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <span className="ml-auto rounded bg-gray-100 px-1.5 text-xs text-gray-600">일치 {Math.round(ref.score * 100)}%</span>
                    </summary>
                    {ref.source === "sif" ? <SifDetail ref_={ref} /> : <RefDetail ref_={ref} canWrite={canWrite} />}
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}

function HazardList({ hazards }: { hazards: { type: string; content: string; freq: string; sev: string }[] }) {
  const list = hazards.filter((h) => h.content);
  if (!list.length) return <p className="mt-1 text-xs text-gray-400">위험요인 없음</p>;
  return (
    <ul className="mt-1 space-y-0.5 text-sm">
      {list.map((h, i) => {
        const v = riskOf(h.freq, h.sev);
        return (
          <li key={i} className="flex items-start gap-1.5">
            <span className="shrink-0 rounded bg-amber-50 px-1 text-xs text-amber-800">{h.type || "유형?"}</span>
            <span className="min-w-0 flex-1 break-words">{h.content}</span>
            {v != null && (
              <span className="shrink-0 rounded px-1 text-xs" style={{ background: riskColor(v), color: riskTextColor(v) }}>
                {v}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RefDetail({ ref_, canWrite }: { ref_: RiskRef; canWrite: boolean }) {
  const m = (k: string) => String(ref_.meta[k] ?? "");
  return (
    <div className="mb-2 space-y-2 rounded-md bg-gray-50 p-2 sm:p-3">
      {(m("ppe") || m("equip")) && (
        <p className="text-xs break-words text-gray-600">
          {m("ppe") && <>보호구 : {m("ppe")} </>}
          {m("equip") && <>· 장비 : {m("equip")}</>}
        </p>
      )}
      <ol className="space-y-2">
        {ref_.steps.map((s, i) => (
          <li key={i} className="rounded border border-gray-200 bg-white p-2">
            <p className="text-sm font-medium break-words whitespace-pre-line">
              {i + 1}. {s.content || "(단계 내용 없음)"}
            </p>
            <HazardList hazards={ref_.source === "jsa" ? s.hazards : s.hazards.map((h) => ({ ...h, freq: "", sev: "" }))} />
            {s.current && <p className="mt-1 text-xs break-words whitespace-pre-line text-gray-600">현재 조치 : {s.current}</p>}
            {s.control && <p className="mt-1 text-xs break-words whitespace-pre-line text-gray-600">감소대책 : {s.control}</p>}
          </li>
        ))}
      </ol>
      {canWrite && (
        <Link href={`/risk/adhoc/new?ref=${ref_.id}`} className="inline-block rounded-md bg-brand-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-900">
          이 자료로 새 JSA 작성
        </Link>
      )}
    </div>
  );
}

function SifDetail({ ref_ }: { ref_: RiskRef }) {
  const rows: [string, string][] = [
    ["업종", String(ref_.meta.industry ?? "")],
    ["고위험작업", String(ref_.meta.situation ?? "")],
    ["재해종류", String(ref_.meta.kind ?? "")],
    ["재해개요", String(ref_.meta.overview ?? "")],
    ["기인물", String(ref_.meta.origin ?? "")],
    ["재해유발요인", String(ref_.meta.factor ?? "")],
    ["감소대책(예시)", String(ref_.meta.measure ?? "")],
  ];
  return (
    <dl className="mb-2 space-y-1.5 rounded-md bg-gray-50 p-2 text-sm sm:p-3">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-medium text-gray-500">{k}</dt>
            <dd className="break-words whitespace-pre-line">{v}</dd>
          </div>
        ))}
    </dl>
  );
}
