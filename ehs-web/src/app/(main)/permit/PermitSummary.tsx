import Link from "next/link";
import { SUPP_TYPES, type PermitApply } from "@/lib/permit";
import { fmtDateTime } from "@/lib/format";

// 발급 정보 · 작업 기본정보 (승인된 내용 — 현장에서 수정 불가)
export function PermitSummary({ p, permitNo, issuedAt, departmentName, riskEval }: {
  p: PermitApply;
  permitNo: string;
  issuedAt: string | null;
  departmentName: string;
  riskEval: { id: string; eval_no: string } | null;
}) {
  const people = (list: PermitApply["managers"]) =>
    list.filter((m) => m.name).map((m) => `${m.org ? `${m.org}/` : ""}${m.name}${m.phone ? ` (${m.phone})` : ""}`).join(" · ") || "-";
  const rows: [string, React.ReactNode][] = [
    ["허가번호", <span key="n" className="font-mono">{permitNo}</span>],
    ["허가(발급)일시", issuedAt ? fmtDateTime(issuedAt) : "발급 전"],
    ["해당부서", departmentName || "-"],
    ["PSM 변경관리 / 가동전점검", `${p.psm} / ${p.preop}`],
    ["작업 종류", p.work_type === "화기" ? "화기작업" : p.work_type === "일반위험" ? "일반위험작업" : "-"],
    ["보충작업", SUPP_TYPES.filter((s) => p.supp.includes(s.key)).map((s) => s.label).join(", ") || "없음"],
    [
      "위험등급",
      p.grade ? (
        <b key="g" className={p.grade === "A" ? "text-red-700" : p.grade === "B" ? "text-amber-700" : "text-emerald-700"}>
          {p.grade}등급
        </b>
      ) : (
        "-"
      ),
    ],
    ["작업일시", `${p.start_dt.replace("T", " ")} ~ ${p.end_dt.slice(0, 10) === p.start_dt.slice(0, 10) ? p.end_dt.slice(11) : p.end_dt.replace("T", " ")}`],
    ["작업장소", p.work_place || "-"],
    ["시공업체명", p.company_name || "-"],
    ["설비번호", p.tags.filter((t) => t.name || t.tag).map((t) => `${t.name}${t.tag ? `(${t.tag})` : ""}`).join(", ") || "-"],
    ["작업관리자", people(p.managers)],
    ["입회자", people(p.witnesses)],
    ["작업절차서", p.checks.docs_proc ? p.fields.proc_no || "필요" : "-"],
    [
      "위험성평가서",
      riskEval ? (
        <Link key="r" href={`/risk/adhoc/${riskEval.id}`} className="font-mono text-brand-800 hover:underline">
          {riskEval.eval_no} ↗
        </Link>
      ) : p.checks.docs_risk ? (
        p.fields.risk_no || "필요"
      ) : (
        "-"
      ),
    ],
  ];
  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <header className="flex items-center gap-2 border-b border-l-4 border-gray-100 border-l-brand-600 px-4 py-3">
        <span className="rounded border border-gray-200 bg-gray-50 px-1.5 font-mono text-[11px] text-gray-500">00·01</span>
        <h2 className="font-bold text-gray-900">허가서 발급 정보 · 작업 기본정보</h2>
        <span className="ml-auto text-xs font-bold text-gray-400">🔒 승인된 내용 · 현장 수정 불가</span>
      </header>
      <div className="p-4">
        <p className="mb-3 text-base font-bold text-gray-900">{p.work_name}</p>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-gray-500">{k}</dt>
              <dd className="text-gray-900">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
