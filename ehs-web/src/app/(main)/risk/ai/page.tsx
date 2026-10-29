import Link from "next/link";
import { getModuleAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { riskColor, riskOf, riskTextColor } from "@/lib/jsa";
import { REF_SOURCES, sourceLabel, type DraftHazard, type DraftStep, type RefSource, type RiskRef } from "@/lib/risk-ref";
import { WORK_CONDITIONS, conditionByKey } from "@/lib/risk-rules";
import { aiInput, aiParams, loadAiDraft } from "@/lib/risk-draft";

const LIMIT: Record<RefSource, number> = { jsa: 8, ext: 5, sif: 8, kosha: 6 };
const group = (g: string | null) => (g ?? "").replace(/^\d+\.\s*/, "");
const TAB = "rounded-md border px-3 py-1.5 text-sm";
const INPUT = "min-w-0 rounded-md border border-gray-300 px-2 py-1.5";

// 위험성평가 › AI 위험성평가 작성
//   작업 설명(+ 조건 · 장비 · 물질) 또는 표준운전절차서 → 우리 JSA 뼈대 초안 + 근거 자료 (우리 JSA · 타사 · 공단 SIF · KOSHA 지침)
export default async function RiskAiPage({ searchParams }: PageProps<"/risk/ai">) {
  const input = aiInput(await searchParams);
  const canWrite = (await getModuleAccess()).find((m) => m.code === "risk_adhoc")?.level === "write";
  const supabase = await createClient();

  const [{ data: counts }, { data: sops }, result] = await Promise.all([
    supabase.rpc("risk_ref_counts"),
    input.mode === "sop"
      ? supabase.from("sop_overview").select("id, sop_no, rev, title, department_name").eq("superseded", false).order("department_name").order("sop_no").limit(500)
      : Promise.resolve({ data: [] }),
    loadAiDraft(supabase, input),
  ]);
  const count = Object.fromEntries(((counts ?? []) as { source: string; n: number }[]).map((c) => [c.source, Number(c.n)]));
  const draft = result?.draft;
  const hidden = [...new URLSearchParams(aiParams(input, { ai: "1" }))];

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          <Link href="/risk/ai" className={`${TAB} ${input.mode === "name" ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 bg-white"}`}>
            작업 설명으로 작성
          </Link>
          <Link href="/risk/ai?mode=sop" className={`${TAB} ${input.mode === "sop" ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 bg-white"}`}>
            표준운전절차서로 작성
          </Link>
        </div>
        <form className="space-y-3">
          {input.mode === "sop" ? (
            <>
              <input type="hidden" name="mode" value="sop" />
              <select name="sop" defaultValue={input.sop} required className={`${INPUT} w-full bg-white`}>
                <option value="">절차서 선택</option>
                {(sops ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {[s.department_name, s.sop_no && `${s.sop_no} Rev.${s.rev}`, s.title].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
              {(sops ?? []).length === 0 && <p className="text-sm text-gray-500">볼 수 있는 표준운전절차서가 없습니다.</p>}
            </>
          ) : (
            <>
              <label className="block text-sm font-medium">
                작업 설명 <span className="text-red-600">*</span>
                <textarea
                  name="q"
                  defaultValue={input.q}
                  required
                  rows={3}
                  placeholder="대상(설비·장소) + 작업 행위 (예: HBC-C2 반응기 R-201 상부 맨홀 개방 후 내부 촉매 교체)"
                  className={`${INPUT} mt-1 block w-full font-normal`}
                />
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  사용 장비·공구
                  <input name="eq" defaultValue={input.eq} placeholder="예: 체인블록, 이동식 크레인, 용접기" className={`${INPUT} mt-1 block w-full font-normal`} />
                </label>
                <label className="block text-sm font-medium">
                  취급 물질
                  <input name="mat" defaultValue={input.mat} placeholder="예: 질산, 과산화수소, 질소" className={`${INPUT} mt-1 block w-full font-normal`} />
                </label>
              </div>
            </>
          )}
          <fieldset>
            <legend className="text-sm font-medium">작업 조건 {input.mode === "sop" && <span className="font-normal text-gray-500">(절차서 글에서도 자동으로 찾음)</span>}</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {WORK_CONDITIONS.map((c) => (
                <label
                  key={c.key}
                  title={c.desc}
                  className="flex cursor-pointer items-center gap-1 rounded-full border border-gray-300 px-2.5 py-1 text-sm has-[:checked]:border-brand-800 has-[:checked]:bg-brand-50"
                >
                  <input type="checkbox" name="c" value={c.key} defaultChecked={input.c.includes(c.key)} className="h-3.5 w-3.5" />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <button className="rounded-md bg-gray-800 px-4 py-1.5 text-sm text-white">초안 만들기</button>
            <p className="text-xs text-gray-500">
              참고 자료 : 우리 JSA {count.jsa ?? 0} · 타사 {count.ext ?? 0} · 공단 SIF {count.sif ?? 0} · KOSHA 지침 {count.kosha ?? 0}
            </p>
          </div>
          {input.mode === "name" && <p className="text-xs text-gray-500">대상과 작업 행위를 함께 적고, 장비·물질·조건을 넣을수록 위험요인과 대책이 정확해집니다.</p>}
        </form>
      </Card>

      {result?.error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">참고 자료를 불러오지 못했습니다 : {result.error}</p>}

      {draft && result && (
        <Card title={`초안 (${draft.steps.length}단계)`}>
          <form action="/risk/adhoc/new" className="space-y-3">
            {hidden.map(([k, v], i) => (
              <input key={i} type="hidden" name={k} value={v} />
            ))}
            {result.sop ? (
              <p className="text-sm">
                뼈대 : 표준운전절차서 <b>{result.sop.title}</b> {result.sop.sop_no && `(${result.sop.sop_no} Rev.${result.sop.rev})`}
              </p>
            ) : draft.isNew ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
                <b>신규 작업 — 현장 확인 필요.</b> 우리 사업장 JSA 에 비슷한 작업이 없어{" "}
                {draft.base ? `${sourceLabel(draft.base.source)} "${draft.base.title}" 를 뼈대로 했습니다.` : "기본 단계만 만들었습니다."} 실제 작업 순서에 맞게 단계를 고쳐 주세요.
              </p>
            ) : (
              draft.base && (
                <p className="text-sm">
                  뼈대 : 우리 JSA <b>{draft.base.title}</b>
                  <span className="text-xs text-gray-500">
                    {" "}
                    ({[group(draft.base.group), draft.base.year && `${draft.base.year}년`, `일치 ${Math.round(draft.base.score * 100)}%`].filter(Boolean).join(" · ")})
                  </span>
                </p>
              )
            )}
            {(result.conds.picked.length > 0 || result.conds.auto.length > 0) && (
              <p className="text-xs text-gray-600">
                작업 조건 : {result.conds.picked.map((k) => conditionByKey(k)?.label).join(" · ")}
                {result.conds.auto.length > 0 && (
                  <span className="text-gray-500">
                    {result.conds.picked.length > 0 && " · "}
                    {result.conds.auto.map((k) => `${conditionByKey(k)?.label}(자동 감지)`).join(" · ")}
                  </span>
                )}
              </p>
            )}
            {draft.sifGaps.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">
                <b>⚠ 비슷한 사망사고(SIF) 사례의 재해 유형 중 초안에 없는 것</b>
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {draft.sifGaps.map((g) => (
                    <li key={g.type} className="break-words">
                      {g.type} — 예: {g.examples.join(" / ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {draft.suggestions.length > 0 && (
              <div className="rounded-md border border-brand-200 bg-brand-50 p-2 text-sm">
                <b>절차서에 없는 단계 제안</b> <span className="text-xs text-gray-600">(체크한 것만 새 JSA 에 넣습니다)</span>
                <ul className="mt-1 space-y-1">
                  {draft.suggestions.map((s) => (
                    <li key={s.key}>
                      <label className="flex items-start gap-2">
                        <input type="checkbox" name="add" value={s.key} defaultChecked className="mt-1 h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words">
                          {s.before + 1}번 단계 앞 : {s.step.content}
                          <span className="text-xs text-gray-500">
                            {" "}
                            ({s.label}
                            {s.ref && ` · 근거 ${s.ref}`})
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ol className="space-y-3">
              {draft.steps.map((d, i) => (
                <StepCard key={i} n={i + 1} step={d} />
              ))}
            </ol>
            <p className="text-xs text-gray-500">
              <b className="text-brand-800">보완</b> = 다른 자료에서 더한 위험 · <b className="text-brand-800">[보완]</b> = 작업 조건의 기본 안전조치 (근거 KOSHA 지침). 빈도·강도는
              우리 JSA 에서 가져온 것만 채워집니다.
            </p>
            {canWrite && <button className="rounded-md bg-brand-800 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900">이 초안으로 새 JSA 작성</button>}
          </form>
        </Card>
      )}

      {result &&
        REF_SOURCES.map((s) => {
          const rows = result.refs[s.key];
          const list = s.key === "kosha" ? byGuide(rows).slice(0, LIMIT.kosha) : rows.slice(0, LIMIT[s.key]).map((r) => [r]);
          return (
            <Card key={s.key} title={`${s.label} (${list.length}건)`}>
              <p className="mb-2 text-xs text-gray-500">{s.note}</p>
              {list.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-500">비슷한 자료가 없습니다.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {list.map((g) => (
                    <li key={g[0].id} className="py-1">
                      <details className="group">
                        <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5">
                          <span className="text-gray-400 group-open:rotate-90">›</span>
                          <span className="min-w-0 font-medium break-words">{s.key === "kosha" ? `${g[0].meta.code} ${g[0].meta.guide}` : g[0].title || "(작업명 없음)"}</span>
                          <span className="text-xs text-gray-500">{subtitle(g[0])}</span>
                          <span className="ml-auto rounded bg-gray-100 px-1.5 text-xs text-gray-600">일치 {Math.round(g[0].score * 100)}%</span>
                        </summary>
                        {s.key === "sif" ? <SifDetail r={g[0]} /> : s.key === "kosha" ? <KoshaDetail parts={g} /> : <RefDetail r={g[0]} canWrite={canWrite} />}
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
    </div>
  );
}

// KOSHA 조각 → 지침별로 묶음 (점수 높은 지침 순, 지침마다 장·절 3개까지)
function byGuide(rows: RiskRef[]) {
  const m = new Map<string, RiskRef[]>();
  for (const r of rows) {
    const k = String(r.meta.code);
    const list = m.get(k) ?? [];
    if (list.length < 3) list.push(r);
    m.set(k, list);
  }
  return [...m.values()];
}
function subtitle(r: RiskRef) {
  if (r.source === "sif") return String(r.meta.origin ?? "");
  if (r.source === "kosha") return String(r.meta.section ?? "");
  return [group(r.group_name), r.area, r.year && `${r.year}년`, Number(r.meta.repeat) > 1 && `${r.meta.repeat}회 평가`].filter(Boolean).join(" · ");
}

function StepCard({ n, step }: { n: number; step: DraftStep }) {
  return (
    <li className="rounded-md border border-gray-200 p-3">
      <p className="text-sm font-medium break-words whitespace-pre-line">
        {n}. {step.content || "(단계 내용 없음)"}
      </p>
      <HazardList hazards={step.hazards} />
      {step.safe && <p className="mt-1 text-xs break-words whitespace-pre-line text-gray-600">현재 조치 : {step.safe}</p>}
      {(step.control || step.measures.length > 0) && (
        <div className="mt-1 text-xs break-words text-gray-700">
          감소대책 :{step.control && <span className="whitespace-pre-line"> {step.control}</span>}
          {step.measures.length > 0 && (
            <ul className="mt-0.5 space-y-0.5">
              {step.measures.map((m, i) => (
                <li key={i}>
                  <b className="text-brand-800">[보완]</b> {m.text} <span className="text-gray-500">({[m.cond, m.ref].filter(Boolean).join(" · ")})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {step.from && (
        <p className="mt-1 text-xs break-words text-gray-500">
          비슷한 과거 단계 : {step.from.title} › {step.from.step} ({sourceLabel(step.from.source)} · 겹침 {step.from.match}%)
        </p>
      )}
    </li>
  );
}

function HazardList({ hazards }: { hazards: DraftHazard[] }) {
  const list = hazards.filter((h) => h.content);
  if (!list.length) return <p className="mt-1 text-xs text-gray-400">위험요인 없음</p>;
  return (
    <ul className="mt-1 space-y-0.5 text-sm">
      {list.map((h, i) => {
        const v = riskOf(h.freq, h.sev);
        return (
          <li key={i} className="flex items-start gap-1.5">
            <span className="shrink-0 rounded bg-amber-50 px-1 text-xs text-amber-800">{h.type || "유형?"}</span>
            <span className="min-w-0 flex-1 break-words">
              {h.content}
              {h.added && (
                <span className="ml-1 text-xs text-brand-800" title={h.added}>
                  보완 <span className="text-gray-500">({h.added})</span>
                </span>
              )}
            </span>
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

function RefDetail({ r, canWrite }: { r: RiskRef; canWrite: boolean }) {
  const m = (k: string) => String(r.meta[k] ?? "");
  return (
    <div className="mb-2 space-y-2 rounded-md bg-gray-50 p-2 sm:p-3">
      {(m("ppe") || m("equip")) && (
        <p className="text-xs break-words text-gray-600">
          {m("ppe") && <>보호구 : {m("ppe")} </>}
          {m("equip") && <>· 장비 : {m("equip")}</>}
        </p>
      )}
      <ol className="space-y-2">
        {r.steps.map((s, i) => (
          <li key={i} className="rounded border border-gray-200 bg-white p-2">
            <p className="text-sm font-medium break-words whitespace-pre-line">
              {i + 1}. {s.content || "(단계 내용 없음)"}
            </p>
            <HazardList hazards={r.source === "jsa" ? s.hazards : s.hazards.map((h) => ({ ...h, freq: "", sev: "" }))} />
            {s.current && <p className="mt-1 text-xs break-words whitespace-pre-line text-gray-600">현재 조치 : {s.current}</p>}
            {s.control && <p className="mt-1 text-xs break-words whitespace-pre-line text-gray-600">감소대책 : {s.control}</p>}
          </li>
        ))}
      </ol>
      {canWrite && (
        <Link href={`/risk/adhoc/new?ref=${r.id}`} className="inline-block rounded-md border border-brand-800 px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-50">
          이 자료만으로 새 JSA 작성
        </Link>
      )}
    </div>
  );
}

function SifDetail({ r }: { r: RiskRef }) {
  const rows: [string, string][] = [
    ["업종", String(r.meta.industry ?? "")],
    ["고위험작업", String(r.meta.situation ?? "")],
    ["재해종류", String(r.meta.kind ?? "")],
    ["재해개요", String(r.meta.overview ?? "")],
    ["기인물", String(r.meta.origin ?? "")],
    ["재해유발요인", String(r.meta.factor ?? "")],
    ["감소대책(예시)", String(r.meta.measure ?? "")],
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

function KoshaDetail({ parts }: { parts: RiskRef[] }) {
  return (
    <div className="mb-2 space-y-2 rounded-md bg-gray-50 p-2 sm:p-3">
      {parts.map((p) => {
        const laws = (p.meta.laws as string[] | undefined) ?? [];
        return (
          <div key={p.id} className="rounded border border-gray-200 bg-white p-2">
            <p className="text-sm font-medium break-words">{String(p.meta.section ?? "")}</p>
            {laws.length > 0 && <p className="mt-0.5 text-xs text-brand-800">관련 법령 : {laws.join(" · ")}</p>}
            <p className="mt-1 max-h-72 overflow-y-auto text-xs break-words whitespace-pre-line text-gray-700">{String(p.meta.text ?? "")}</p>
          </div>
        );
      })}
    </div>
  );
}
