/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { HAZARD_COLS, PURPOSES, SOP_FORM_NO, type SopForm } from "@/lib/sop";

// 안전운전 절차서 CF410-01 R02 인쇄 복제본 (A4 가로) — 1p 제개정 이력 · 2p~ 절차서 (작업 단계가 많으면 이어서)
//   stamps : 이번 Rev. 결재 [작성, 검토, 검토, 승인] 칸에 들어갈 "이름\n일시"
export function SopPaper({ f, rev, departmentName, riskNo, photoUrls, stamps }: {
  f: SopForm;
  rev: number;
  departmentName: string;
  riskNo: string;
  photoUrls: Record<string, string>;
  stamps: [string, string, string, string];
}) {
  const box = (on: boolean, label: string) => (
    <span key={label} style={{ display: "inline-block", whiteSpace: "nowrap", marginRight: "8pt", fontWeight: on ? 700 : 400 }}>
      {on ? "■" : "□"} {label}
    </span>
  );
  const history = [...f.history].sort((a, b) => a.rev - b.rev);
  const histRows = Array.from({ length: Math.max(7, history.length) }, (_, i) => history[i]);

  return (
    <>
      {/* ---------------- 제개정 이력 ---------------- */}
      <div className="paper-page">
        <table className="paper">
          <colgroup>
            {Array.from({ length: 10 }, (_, i) => (
              <col key={i} style={{ width: "10%" }} />
            ))}
          </colgroup>
          <tbody>
            <tr>
              <td colSpan={2} rowSpan={2} className="c" style={{ fontWeight: 700 }}>삼영순화(주)</td>
              <td colSpan={5} rowSpan={2} className="title" style={{ fontSize: "16pt" }}>{f.title}</td>
              <L>표준번호</L>
              <V c={2} mono>{f.sop_no}</V>
            </tr>
            <tr>
              <L>공정명</L>
              <V c={2}>{f.process_name}</V>
            </tr>
            <tr>
              {["NO", "Rev. No", "변경 내용", "일자", "작성", "검토", "검토", "승인"].map((h, i) => (
                <td key={i} colSpan={h === "변경 내용" ? 3 : 1} className="hd">{h}</td>
              ))}
            </tr>
            {histRows.map((h, i) => {
              const mine = h && h.rev === rev;
              return (
                <tr key={i} style={{ height: "11mm" }}>
                  <td className="c">{h ? i + 1 : ""}</td>
                  <td className="c">{h?.rev ?? ""}</td>
                  <td colSpan={3}>{h?.content ?? ""}</td>
                  <td className="c">{h?.date ?? ""}</td>
                  {[0, 1, 2, 3].map((k) => (
                    <td key={k} className="c pre" style={{ fontSize: "7.4pt" }}>{mine ? stamps[k] : ""}</td>
                  ))}
                </tr>
              );
            })}
            <tr>
              <td colSpan={10} className="hd">표 준 회 람</td>
            </tr>
            <tr>
              {Array.from({ length: 5 }).flatMap((_, i) => [
                <td key={`n${i}`} className="hd">성명</td>,
                <td key={`d${i}`} className="hd">회람 일자</td>,
              ])}
            </tr>
            {Array.from({ length: 7 }).map((_, r) => (
              <tr key={r} style={{ height: "9mm" }}>
                {Array.from({ length: 10 }).map((__, c) => (
                  <td key={c} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <Foot />
      </div>

      {/* ---------------- 절차서 ---------------- */}
      <div className="paper-page">
        <table className="paper small">
          <colgroup>
            {[4, 7, 7, 8, 8, 8, 8, 8, 9, 9, 8, 8, 8].map((w, i) => (
              <col key={i} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <td colSpan={3} rowSpan={4} className="c" style={{ fontWeight: 700 }}>삼영순화(주)</td>
              <td colSpan={8} rowSpan={4} className="title" style={{ fontSize: "17pt" }}>{f.title}</td>
              <L>표준번호</L>
              <V c={1} mono>{f.sop_no}</V>
            </tr>
            <tr>
              <L>위험성평가<br />작업번호</L>
              <V c={1} mono>{riskNo}</V>
            </tr>
            <tr>
              <L>위험등급</L>
              <V c={1}>{f.grade && `${f.grade}등급`}</V>
            </tr>
            <tr>
              <L>Rev.</L>
              <V c={1}>{rev}</V>
            </tr>
            <tr>
              <L c={2}>공 정 명</L>
              <V c={3}>{f.process_name}</V>
              <L>작성부서</L>
              <V c={2}>{departmentName}</V>
              <L c={3}>취급물질의 주요물성 및 유해 위험성</L>
              <L c={2}>비상 연락처</L>
            </tr>
            <tr>
              <L c={2}>적용범위</L>
              <V c={3}>{f.scope}</V>
              <L>작 성 자</L>
              <V c={2}>{f.writers}</V>
              <td colSpan={3} rowSpan={4} className="pre" style={{ verticalAlign: "top" }}>{f.materials}</td>
              <td colSpan={2} rowSpan={4} className="pre" style={{ verticalAlign: "top" }}>{f.contacts}</td>
            </tr>
            <tr>
              <L c={2}>용&nbsp;&nbsp;&nbsp;&nbsp;도</L>
              <V c={6}>{PURPOSES.map((p) => box(f.purposes.includes(p), p))}</V>
            </tr>
            <tr>
              <L c={2}>준 비 물</L>
              <V c={6}>{f.supplies}</V>
            </tr>
            <tr>
              <L c={2}>개인 보호구</L>
              <V c={6}>{f.ppe}</V>
            </tr>
            <tr>
              <td colSpan={9} className="hd">유해위험 요인 Check</td>
              <td colSpan={4} className="hd">이상발생시 조치요령</td>
            </tr>
            <tr>
              {HAZARD_COLS.map((col, i) => (
                <td key={i} colSpan={i === 0 ? 3 : 2} style={{ verticalAlign: "top" }}>
                  {col.map((h) => (
                    <div key={h}>{box(f.hazards.includes(h), h)}</div>
                  ))}
                </td>
              ))}
              <td colSpan={4} className="pre" style={{ verticalAlign: "top" }}>{f.emergency}</td>
            </tr>
            <tr>
              <td className="hd">No</td>
              <td colSpan={2} className="hd">작업 단계</td>
              <td colSpan={3} className="hd">사진</td>
              <td colSpan={2} className="hd">유해위험 요인</td>
              <td colSpan={2} className="hd">작업 내용</td>
              <td className="hd">안전 대책</td>
              <td colSpan={2} className="hd">안전설비 및 작업관리기준</td>
            </tr>
          </thead>
          <tbody>
            {f.steps.map((s, i) => (
              <tr key={i}>
                <td className="c">{i + 1}</td>
                <td colSpan={2} className="c pre" style={{ fontWeight: 700 }}>{s.name}</td>
                <td colSpan={3} className="c" style={{ padding: "2pt" }}>
                  {s.photos.map((p) =>
                    photoUrls[p] ? (
                      <img key={p} src={photoUrls[p]} alt="" style={{ display: "inline-block", width: s.photos.length > 1 ? "48%" : "96%", maxHeight: "42mm", objectFit: "contain", margin: "1pt" }} />
                    ) : null,
                  )}
                </td>
                <td colSpan={2} className="pre" style={{ verticalAlign: "top" }}>{s.hazard}</td>
                <td colSpan={2} className="pre" style={{ verticalAlign: "top" }}>{s.work}</td>
                <td className="pre" style={{ verticalAlign: "top" }}>{s.safety}</td>
                <td colSpan={2} className="pre" style={{ verticalAlign: "top" }}>{s.standard}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Foot />
      </div>
    </>
  );
}

function L({ c = 1, children }: { c?: number; children: ReactNode }) {
  return <td colSpan={c} className="lbl">{children}</td>;
}

function V({ c, children, mono }: { c: number; children?: ReactNode; mono?: boolean }) {
  return <td colSpan={c} className={mono ? "mono" : ""}>{children}</td>;
}

function Foot() {
  return (
    <div className="paper-foot">
      <span>양식 {SOP_FORM_NO}</span>
      <span>삼영순화주식회사</span>
      <span>A4(297×210)</span>
    </div>
  );
}
