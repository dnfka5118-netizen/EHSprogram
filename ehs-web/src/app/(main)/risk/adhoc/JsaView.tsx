import { ScrollX } from "@/components/ScrollX";
import { CONTROL_OPTS, aggregate, riskColor, riskOf, riskTextColor, type JsaForm } from "@/lib/jsa";
import { fmtDate } from "@/lib/format";
import { AggTable, Panel } from "./JsaEditor";

// 결재 중 / 결재 완료 평가서 보기 (수정 불가)
export function JsaView({ form, departmentName, evalNo }: { form: JsaForm; departmentName: string; evalNo: string }) {
  const agg = aggregate(form.steps);
  const info: [string, string][] = [
    ["평가번호", evalNo],
    ["평가일자", fmtDate(form.eval_date)],
    ["부서명", departmentName],
    ["관리감독자", `${form.super_name || "-"}${form.super_count ? ` (${form.super_count}명)` : ""}`],
    ["작업자", `${form.worker_name || "-"}${form.worker_count ? ` (${form.worker_count}명)` : ""}`],
    ["EHS", `${form.ehs_name || "-"}${form.ehs_count ? ` (${form.ehs_count}명)` : ""}`],
    ["작업명", form.work_name + (form.work_no ? ` (${form.work_no})` : "")],
    ["작업 지역", form.work_area],
    ["S O P 번호", form.sop_no],
    ["취급 물질", form.material],
    ["필요 보호구", form.ppe],
    ["필요 (측정)장비/공구", form.equip],
    ["필요 안전장비", form.safety_equip],
    ["필요 자료", form.req_docs],
  ];
  return (
    <div className="space-y-4">
      <Panel num="00" title="평가 기본정보 · 작업 기본정보">
        <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-3">
          {info.map(([k, v]) => (
            <div key={k} className={k === "작업명" ? "md:col-span-3" : ""}>
              <dt className="text-xs text-gray-500">{k}</dt>
              <dd className="text-gray-900">{v || "-"}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <Panel num="02" title="위험 유형 자동집계" tone="warn">
        <AggTable count={agg.count} max={agg.max} />
      </Panel>
      <Panel num="03" title="작업단계별 위험성평가" sub={`${form.steps.length}개 단계`}>
        <ScrollX>
          <table className="w-full min-w-[1100px] border-collapse text-xs">
            <thead className="bg-brand-50 text-gray-700">
              <tr>
                {["번호", "분류", "작업 내용", "유형", "유해위험요인", "빈도", "강도", "위험도", "현재안전조치", "감소 대책", "개선번호", "목표일", "담당자", "통제 후", "완료일"].map((h) => (
                  <th key={h} className="border border-gray-200 px-1.5 py-1.5 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {form.steps.map((s, i) =>
                s.hazards.map((h, j) => {
                  const r = riskOf(h.freq, h.sev);
                  const c = s.control;
                  const post = c.needed ? riskOf(c.postFreq, c.postSev) : null;
                  const first = j === 0;
                  const rs = s.hazards.length;
                  return (
                    <tr key={`${i}-${j}`} className="align-top">
                      {first && <td rowSpan={rs} className="border border-gray-200 px-1.5 py-1 text-center font-mono">{i + 1}</td>}
                      {first && <td rowSpan={rs} className="border border-gray-200 px-1.5 py-1">{s.cat}</td>}
                      {first && <td rowSpan={rs} className="border border-gray-200 px-1.5 py-1 whitespace-pre-wrap">{s.content}</td>}
                      <td className="border border-gray-200 px-1.5 py-1 whitespace-nowrap">{h.type}</td>
                      <td className="border border-gray-200 px-1.5 py-1">{h.content}</td>
                      <td className="border border-gray-200 px-1.5 py-1 text-center">{h.freq}</td>
                      <td className="border border-gray-200 px-1.5 py-1 text-center">{h.sev}</td>
                      <td className="border border-gray-200 px-1.5 py-1 text-center font-mono font-bold" style={r ? { background: riskColor(r), color: riskTextColor(r) } : undefined}>{r ?? ""}</td>
                      {first && <td rowSpan={rs} className="border border-gray-200 px-1.5 py-1 whitespace-pre-wrap">{s.safe}</td>}
                      {first && (
                        <td rowSpan={rs} className="border border-gray-200 px-1.5 py-1 whitespace-pre-wrap">
                          {c.needed && (
                            <>
                              <span className="block text-[11px] text-gray-600">{CONTROL_OPTS.map((o) => `${c.checks.includes(o) ? "☑" : "☐"}${o}`).join(" ")}</span>
                              {c.desc}
                            </>
                          )}
                        </td>
                      )}
                      {first && <td rowSpan={rs} className="border border-gray-200 px-1.5 py-1 font-mono">{c.needed ? c.impNo : ""}</td>}
                      {first && <td rowSpan={rs} className="border border-gray-200 px-1.5 py-1 whitespace-nowrap">{c.needed ? fmtDate(c.target) : ""}</td>}
                      {first && <td rowSpan={rs} className="border border-gray-200 px-1.5 py-1">{c.needed ? c.owner : ""}</td>}
                      {first && (
                        <td rowSpan={rs} className="border border-gray-200 px-1.5 py-1 text-center font-mono font-bold" style={post ? { background: riskColor(post), color: riskTextColor(post) } : undefined}>
                          {post ? `${c.postFreq}×${c.postSev}=${post}` : ""}
                        </td>
                      )}
                      {first && <td rowSpan={rs} className="border border-gray-200 px-1.5 py-1 whitespace-nowrap">{c.needed && c.done ? fmtDate(c.done) : ""}</td>}
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </ScrollX>
      </Panel>
    </div>
  );
}
