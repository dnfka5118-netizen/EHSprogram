/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { findingStatusLabel, type DailyLogData } from "@/lib/daily-log";
import { RESULT_HINT, ymLabel } from "@/lib/daily";
import { fmtDate } from "@/lib/format";

const RESULT_CLS: Record<string, string> = { O: "text-emerald-700", X: "font-bold text-red-600", "△": "font-bold text-amber-600", "-": "text-gray-400" };
const B = "border border-gray-400";
const DAY_BG = { missed: "bg-red-100", backfill: "bg-violet-100", substitute: "bg-amber-100" } as const;
const DAY_LABEL = { missed: "미점검", backfill: "소급", substitute: "대체" } as const;

// 안전보건 관리감독자 일일업무일지 (원본 양식 배치 : 1. 주요 점검 활동 1~31일 · 2. 점검 결과 기록 · 3. 세부 개선 진행사항)
// approvalSlot : 상신 전 일지 화면에서 오른쪽 위 결재란 자리에 [상신] + 눌러서 결재라인 지정하는 결재란을 넣음
export function DailyLogSheet({ d, stamps, approvalSlot }: { d: DailyLogData; stamps: { label: string; name: string; date: string }[]; approvalSlot?: ReactNode }) {
  const dayCols = Array.from({ length: 31 }, (_, i) => i + 1);
  return (
    <div className="space-y-4 text-[11px] text-gray-900">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-full md:basis-0">
          <h2 className="text-base font-bold break-keep">{d.form.name}</h2>
          <table className="mt-2 w-full max-w-xl border-collapse">
            <tbody>
              <tr>
                <th className={`${B} w-20 bg-gray-100 px-2 py-1`}>작성 년월</th>
                <td className={`${B} px-2 py-1`}>{ymLabel(d.ym)}</td>
                <th className={`${B} w-20 bg-gray-100 px-2 py-1`}>사업장 명</th>
                <td className={`${B} px-2 py-1`}>{d.area.site ?? ""}</td>
              </tr>
              <tr>
                <th className={`${B} bg-gray-100 px-2 py-1`}>담당 Area</th>
                <td className={`${B} px-2 py-1 break-keep`}>{d.area.label}</td>
                <th className={`${B} bg-gray-100 px-2 py-1`}>점검자</th>
                <td className={`${B} px-2 py-1 break-keep`}>{d.inspectors.join(", ") || "-"}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="ml-auto max-w-full">
          {approvalSlot ?? (
            <table className="border-collapse text-center">
              <tbody>
                <tr>
                  <th rowSpan={2} className={`${B} w-6 bg-gray-100 px-1 [writing-mode:vertical-rl]`}>
                    결 재
                  </th>
                  {stamps.map((s) => (
                    <th key={s.label} className={`${B} w-20 bg-gray-100 px-1 py-0.5`}>
                      {s.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  {stamps.map((s) => (
                    <td key={s.label} className={`${B} h-12 px-1 align-middle`}>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-[9px] text-gray-500">{s.date}</div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      <section>
        <p className="mb-1 flex flex-wrap gap-x-3 font-bold">
          1. 주요 점검 활동 내용 <span className="font-normal text-gray-600">{RESULT_HINT}</span>
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className={`${B} w-20 px-1`}>활동 항목</th>
                <th className={`${B} w-9 px-1`}>구분</th>
                <th className={`${B} px-1`}>세부 항목</th>
                <th className={`${B} w-9 px-1`}>주기</th>
                {dayCols.map((n) => (
                  <th
                    key={n}
                    className={`${B} w-[18px] px-0 ${n > d.days ? "bg-gray-300" : d.dayKind[n] ? DAY_BG[d.dayKind[n]] : ""}`}
                    title={d.dayKind[n] ? DAY_LABEL[d.dayKind[n]] : undefined}
                  >
                    {n}
                    {d.dayKind[n] && <div className="text-[7px] leading-none font-normal">{DAY_LABEL[d.dayKind[n]]}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.items.map((it, idx) => {
                const first = idx === 0 || d.items[idx - 1].category !== it.category;
                const span = first ? d.items.slice(idx).findIndex((x, k) => k > 0 && x.category !== it.category) : 0;
                return (
                  <tr key={it.id}>
                    {first && (
                      <td rowSpan={span === -1 ? d.items.length - idx : span} className={`${B} px-1 text-center break-keep`}>
                        {it.category}
                      </td>
                    )}
                    <td className={`${B} px-1 text-center`}>{it.code}</td>
                    <td className={`${B} px-1 break-keep whitespace-pre-line`}>{it.content}</td>
                    <td className={`${B} px-0.5 text-center text-[10px]`}>
                      {it.cycle}
                      {it.cycle_note && <div className="text-[8px] leading-tight text-gray-500">({it.cycle_note})</div>}
                    </td>
                    {dayCols.map((n) => {
                      const v = d.cells[it.id]?.[n];
                      return (
                        <td key={n} className={`${B} px-0 text-center ${n > d.days ? "bg-gray-300" : d.dayKind[n] ? DAY_BG[d.dayKind[n]] : ""} ${v ? RESULT_CLS[v] : ""}`}>
                          {v ?? ""}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {d.dayNotes.length > 0 && (
        <section className="break-inside-avoid">
          <p className="mb-1 flex flex-wrap gap-x-3 font-bold">
            점검 실시 기록 (미점검 · 대체 · 소급)
            <span className="font-normal text-gray-600">
              <span className={`mr-1 inline-block h-2.5 w-3 ${DAY_BG.missed}`} />
              미점검 <span className={`mr-1 ml-2 inline-block h-2.5 w-3 ${DAY_BG.substitute}`} />
              대체 점검 <span className={`mr-1 ml-2 inline-block h-2.5 w-3 ${DAY_BG.backfill}`} />
              소급 입력
            </span>
          </p>
          <table className="w-full border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className={`${B} w-20`}>일자</th>
                <th className={`${B} w-16`}>구분</th>
                <th className={`${B} w-24`}>점검자</th>
                <th className={B}>내용</th>
              </tr>
            </thead>
            <tbody>
              {d.dayNotes.map((n) => (
                <tr key={n.date} className={DAY_BG[n.kind]}>
                  <td className={`${B} text-center`}>{fmtDate(n.date)}</td>
                  <td className={`${B} text-center font-medium`}>{DAY_LABEL[n.kind]}</td>
                  <td className={`${B} text-center`}>{n.who || "-"}</td>
                  <td className={`${B} px-1 break-keep`}>{n.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="break-inside-avoid">
        <p className="mb-1 font-bold">2. 주요 점검 결과 및 개선 내용 기록</p>
        <table className="w-full border-collapse">
          <thead className="bg-gray-100">
            <tr>
              <th className={`${B} w-8`}>NO</th>
              <th className={`${B} w-20`}>일자</th>
              <th className={`${B} w-12`}>구분</th>
              <th className={B}>점검 결과 및 개선 내용</th>
              <th className={`${B} w-20`}>비고</th>
            </tr>
          </thead>
          <tbody>
            {d.records.map((r, i) => (
              <tr key={i}>
                <td className={`${B} text-center`}>{i + 1}</td>
                <td className={`${B} text-center`}>{fmtDate(r.date)}</td>
                <td className={`${B} text-center`}>
                  {r.code} <span className={RESULT_CLS[r.result]}>{r.result}</span>
                </td>
                <td className={`${B} px-1 break-keep`}>{r.note}</td>
                <td className={`${B} text-center`}>{r.remark}</td>
              </tr>
            ))}
            {d.records.length === 0 && (
              <tr>
                <td colSpan={5} className={`${B} py-2 text-center text-gray-500`}>
                  부적합 · 이벤트 기록 없음
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <table className="mt-1 w-full border-collapse text-center">
          <tbody>
            <tr>
              <th className={`${B} bg-gray-100`}>해당 월 조치 발굴 (건)</th>
              <td className={B}>{d.counts.found}</td>
              <th className={`${B} bg-gray-100`}>당해년도 조치 발굴 누계 (건)</th>
              <td className={B}>{d.counts.foundYear}</td>
              <th className={`${B} bg-gray-100`}>해당 월 조치 완료 (건)</th>
              <td className={B}>{d.counts.closed}</td>
              <th className={`${B} bg-gray-100`}>당해년도 조치 완료 누계 (건)</th>
              <td className={B}>{d.counts.closedYear}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="break-inside-avoid">
        <p className="mb-1 font-bold">3. 세부 개선 진행사항 관리</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className={`${B} w-8`}>NO</th>
                <th className={B}>개선 필요 사항</th>
                <th className={`${B} w-24`}>개선 전</th>
                <th className={`${B} w-24`}>개선 후</th>
                <th className={B}>개선 계획 및 결과</th>
                <th className={`${B} w-20`}>납기일</th>
                <th className={`${B} w-20`}>비고</th>
              </tr>
            </thead>
            <tbody>
              {d.findings.map((f, i) => (
                <tr key={f.id}>
                  <td className={`${B} text-center`}>{i + 1}</td>
                  <td className={`${B} px-1 break-keep`}>
                    <a href={`/findings/${f.id}`} className="hover:underline">
                      {f.problem}
                    </a>
                  </td>
                  <td className={`${B} p-0.5`}>{f.before && <img src={f.before} alt="개선 전" className="mx-auto h-16 w-full object-cover" />}</td>
                  <td className={`${B} p-0.5`}>{f.after && <img src={f.after} alt="개선 후" className="mx-auto h-16 w-full object-cover" />}</td>
                  <td className={`${B} px-1 break-keep whitespace-pre-line`}>{f.plan || "-"}</td>
                  <td className={`${B} text-center`}>{fmtDate(f.due)}</td>
                  <td className={`${B} text-center break-keep`}>
                    {f.action === "immediate" ? "즉시 조치 · " : ""}
                    {findingStatusLabel(f.status)}
                  </td>
                </tr>
              ))}
              {d.findings.length === 0 && (
                <tr>
                  <td colSpan={7} className={`${B} py-2 text-center text-gray-500`}>
                    이번 달 개선 건 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-right text-[9px] text-gray-500">{d.form.form_no} · 삼영순화㈜</p>
      </section>
    </div>
  );
}
