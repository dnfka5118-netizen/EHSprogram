import { CHEM_RESULTS, type ChemCheck } from "@/lib/chem";
import { fmtDate } from "@/lib/format";

const B = "border border-gray-500";

// 유해화학물질 취급시설 자체점검대장 (별지 제42호서식 배치 : 항목 × 이상 유무 3줄 × 점검장소, 비고)
export function ChemSheet({ d, stamps }: { d: ChemCheck; stamps: { label: string; name: string; date: string }[] }) {
  return (
    <div className="space-y-2 text-[11px] text-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px]">■ 화학물질관리법 시행규칙 [별지 제42호서식]</p>
          <h2 className="mt-2 text-lg font-bold">유해화학물질 취급시설 자체점검대장</h2>
        </div>
        <table className="border-collapse text-center">
          <tbody>
            <tr>
              {stamps.map((s) => (
                <th key={s.label} className={`${B} w-20 bg-gray-100 px-1 py-0.5 font-medium`}>
                  {s.label}
                </th>
              ))}
            </tr>
            <tr>
              {stamps.map((s) => (
                <td key={s.label} className={`${B} h-11 px-1`}>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-[9px] text-gray-500">{s.date}</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <table className="w-full border-collapse text-center">
        <thead className="bg-gray-100">
          <tr>
            <th className={B}>점검연월일</th>
            <th className={B}>점검시간</th>
            <th className={B}>소속</th>
            <th className={B}>성명</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={`${B} py-1`}>{fmtDate(d.check_date)}</td>
            <td className={B}>{d.time_text ?? ""}</td>
            <td className={B}>{d.inspector?.department ?? d.group.department ?? ""}</td>
            <td className={B}>
              {d.inspector?.name ?? ""}
              {d.sub_reason && <div className="text-[9px] text-gray-600">(대체 점검 · {d.sub_reason})</div>}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead className="bg-gray-100">
            <tr>
              <th rowSpan={2} className={`${B} w-44`}>
                점검 항목
              </th>
              <th rowSpan={2} className={`${B} w-16`}>
                이상 유무
              </th>
              <th colSpan={Math.max(1, d.places.length)} className={B}>
                점검장소
              </th>
              <th rowSpan={2} className={`${B} w-28`}>
                비고
              </th>
            </tr>
            <tr>
              {d.places.map((p) => (
                <th key={p.id} className={`${B} px-0.5 text-[10px] font-medium break-keep`}>
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.items.map((i) =>
              CHEM_RESULTS.map((r, k) => (
                <tr key={`${i.id}${r.v}`}>
                  {k === 0 && (
                    <td rowSpan={3} className={`${B} px-1 align-middle break-keep`}>
                      {i.code} {i.content}
                    </td>
                  )}
                  <td className={`${B} px-0.5 text-center text-[10px] break-keep`}>{r.label}</td>
                  {d.places.map((p) => {
                    const on = d.results[`${i.id}|${p.id}`] === r.v;
                    return (
                      <td key={p.id} className={`${B} text-center ${on && r.v !== "ok" ? (r.v === "recheck" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800") : ""}`}>
                        [{on ? "✔" : "  "}]
                      </td>
                    );
                  })}
                  {k === 0 && (
                    <td rowSpan={3} className={`${B} px-1 align-middle break-keep`}>
                      {d.notes[i.id]?.note ?? ""}
                    </td>
                  )}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[9px] text-gray-500">
        비고 1. 비고란에는 자체점검 시 조치완료된 사항 또는 재점검이 필요한 사항을 적습니다. 2. 유해화학물질 취급시설 자체점검을 하려는 자는 양식의 점검 항목이 모두 포함된 별도의 서식을 사용할 수
        있으며, 점검 항목이 모두 포함되어 있음을 명확하게 알 수 있도록 표기해야 합니다.
      </p>
      <p className="flex justify-between text-[9px] text-gray-500">
        <span>양식 CE310-07, R01</span>
        <span>삼영순화주식회사</span>
        <span>A4(210×297)</span>
      </p>
    </div>
  );
}
