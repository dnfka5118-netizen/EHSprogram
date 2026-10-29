/* eslint-disable @next/next/no-img-element */
import { Card } from "@/components/ui";
import { HAZARD_COLS, PURPOSES, type SopForm } from "@/lib/sop";

// 결재 중·결재 완료 절차서 보기 (휴대폰에서도 읽기 쉽게 한 줄씩)
export function SopView({ form: f, departmentName, riskNo, photoUrls }: { form: SopForm; departmentName: string; riskNo: string; photoUrls: Record<string, string> }) {
  const rows: [string, string][] = [
    ["표준명", f.title],
    ["공정명", f.process_name],
    ["작성부서", departmentName],
    ["작성자", f.writers],
    ["적용범위", f.scope],
    ["위험성평가 작업번호", riskNo],
    ["위험등급", f.grade ? `${f.grade}등급` : ""],
    ["준비물", f.supplies],
    ["개인 보호구", f.ppe],
  ];
  const box = (on: boolean) => (on ? "■" : "□");
  return (
    <div className="space-y-4">
      <Card title="표준 정보">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <dt className="w-32 shrink-0 text-gray-500">{k}</dt>
              <dd className="min-w-0 text-gray-900">{v || "-"}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm">
          <span className="mr-3 text-gray-500">용도</span>
          {PURPOSES.map((p) => (
            <span key={p} className={`mr-3 inline-block ${f.purposes.includes(p) ? "font-semibold text-gray-900" : "text-gray-400"}`}>
              {box(f.purposes.includes(p))} {p}
            </span>
          ))}
        </p>
        <div className="mt-3 grid gap-3 text-sm md:grid-cols-[2fr_1fr]">
          <div>
            <p className="mb-1 text-gray-500">취급물질의 주요물성 및 유해 위험성</p>
            <p className="whitespace-pre-wrap">{f.materials || "-"}</p>
          </div>
          <div>
            <p className="mb-1 text-gray-500">비상 연락처</p>
            <p className="whitespace-pre-wrap">{f.contacts || "-"}</p>
          </div>
        </div>
      </Card>
      <Card title="유해위험 요인 Check · 이상발생시 조치요령">
        <div className="grid gap-4 text-sm lg:grid-cols-2">
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {HAZARD_COLS.flat().map((h) => (
              <span key={h} className={f.hazards.includes(h) ? "font-semibold text-gray-900" : "text-gray-400"}>
                {box(f.hazards.includes(h))} {h}
              </span>
            ))}
          </div>
          <p className="whitespace-pre-wrap">{f.emergency || "-"}</p>
        </div>
      </Card>
      <Card title={`작업 단계 (${f.steps.length})`}>
        <div className="space-y-4">
          {f.steps.map((s, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-3 text-sm">
              <p className="mb-2 font-semibold text-gray-900">
                {i + 1}. {s.name}
              </p>
              {s.photos.length > 0 && (
                <div className="mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {s.photos.map((p) => (
                    <a key={p} href={photoUrls[p]} target="_blank" className="block aspect-[4/3] overflow-hidden rounded border border-gray-200 bg-gray-100">
                      {photoUrls[p] && <img src={photoUrls[p]} alt="" className="h-full w-full object-cover" />}
                    </a>
                  ))}
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {(
                  [
                    ["작업 내용", s.work],
                    ["유해위험 요인", s.hazard],
                    ["안전 대책", s.safety],
                    ["안전설비 및 작업관리기준", s.standard],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <p className="mb-0.5 text-xs text-gray-500">{k}</p>
                    <p className="whitespace-pre-wrap">{v || "-"}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="제개정 이력">
        <ul className="space-y-1 text-sm">
          {f.history.map((h, i) => (
            <li key={i}>
              <span className="mr-2 font-mono">Rev.{h.rev}</span>
              <span className="mr-2 text-gray-500">{h.date}</span>
              {h.content}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
