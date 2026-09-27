import { CONTROL_OPTS, HAZARD_GROUPS, HAZARD_TYPES, aggregate, riskColor, riskOf, riskTextColor, type JsaForm } from "@/lib/jsa";
import { fmtDate } from "@/lib/format";

// CF112-01/02 R02 인쇄 복제본 — 표지(갑) 24열 + 상세표(을) 25열 (안전작업허가서 인쇄에도 첨부)
export function JsaPaper({ form: f, evalNo, evalDate, departmentName, stamps }: {
  form: JsaForm;
  evalNo: string;
  evalDate: string;
  departmentName: string;
  stamps: Record<string, string[]>;
}) {
  const agg = aggregate(f.steps);
  const cnt = (n: string) => (n ? ` (${n}명)` : "");
  const riskCell = (v: number | null) => (v ? { background: riskColor(v), color: riskTextColor(v) } : undefined);
  const cols24 = <colgroup>{Array.from({ length: 24 }, (_, i) => <col key={i} style={{ width: `${100 / 24}%` }} />)}</colgroup>;
  const detailWidths = [1.792, 11.312, 2.464, 1.456, 8.904, 3.528, 1.624, 12.825, 4.536, 3.92, 4.536, 2.52, 3.777, 3.777, 2.24, 3.192, 2.744, 3.777, 3.777, 3.777, 3.777, 2.128, 2.24, 2.632, 2.744];

  return (
    <div className="paper-sheets">
      {/* ------------------------- 표지 (갑) ------------------------- */}
      <div className="paper-page">
        <table className="paper">
          {cols24}
          <tbody>
            <tr>
              <td colSpan={15} className="nb" />
              <td colSpan={1} className="nb" />
              {["담당", "검토", "승인", "확인"].map((r) => (
                <td key={r} colSpan={2} className="hd">{r}</td>
              ))}
            </tr>
            <tr>
              <td colSpan={16} className="title">
                작업 위험성평가서
                <br />
                <span style={{ fontSize: "10pt" }}>(Job Safety Analysis)</span>
              </td>
              {["담당", "검토", "승인", "확인"].map((r) => (
                <td key={r} colSpan={2} className="sig pre">{(stamps[r] ?? []).join("\n")}</td>
              ))}
            </tr>
            <tr>
              <td colSpan={3} className="lbl">평 가 번 호</td>
              <td colSpan={9} className="mono">{evalNo}</td>
              <td colSpan={3} className="lbl">부 서 명</td>
              <td colSpan={9}>{departmentName}</td>
            </tr>
            <tr>
              <td colSpan={3} className="lbl">평 가 일 자</td>
              <td colSpan={9}>{evalDate}</td>
              <td colSpan={3} className="lbl">작업명<br />작업 번호</td>
              <td colSpan={9}>{f.work_name}{f.work_no && `  (${f.work_no})`}</td>
            </tr>
            <tr>
              <td colSpan={3} rowSpan={3} className="lbl">평가 참여자</td>
              <td colSpan={2} className="lbl">관리감독자</td>
              <td colSpan={7}>{f.super_name}{cnt(f.super_count)}</td>
              <td colSpan={3} rowSpan={3} className="lbl">평가 참여 인원수</td>
              <td colSpan={2} className="lbl">관리감독자</td>
              <td colSpan={7}>{f.super_count && `${f.super_count} 명`}</td>
            </tr>
            <tr>
              <td colSpan={2} className="lbl">작 업 자</td>
              <td colSpan={7}>{f.worker_name}{cnt(f.worker_count)}</td>
              <td colSpan={2} className="lbl">작 업 자</td>
              <td colSpan={7}>{f.worker_count && `${f.worker_count} 명`}</td>
            </tr>
            <tr>
              <td colSpan={2} className="lbl">E H S</td>
              <td colSpan={7}>{f.ehs_name}{cnt(f.ehs_count)}</td>
              <td colSpan={2} className="lbl">E H S</td>
              <td colSpan={7}>{f.ehs_count && `${f.ehs_count} 명`}</td>
            </tr>
            {[
              ["작 업 지 역", f.work_area, "취 급 물 질", f.material],
              ["S O P 번호", f.sop_no, "필요\n(측정)장비/공구", f.equip],
              ["필 요 보 호 구", f.ppe, "필요 안전장비", f.safety_equip],
            ].map(([a, b, c, d]) => (
              <tr key={a}>
                <td colSpan={3} className="lbl pre">{a}</td>
                <td colSpan={9} className={a.startsWith("S O P") ? "mono" : ""}>{b}</td>
                <td colSpan={3} className="lbl pre">{c}</td>
                <td colSpan={9}>{d}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} className="lbl">필 요 자 료</td>
              <td colSpan={9}>{f.req_docs}</td>
              <td colSpan={12} className="nb" />
            </tr>
            <tr>
              <td colSpan={24} className="nb" style={{ height: "3mm", padding: 0 }} />
            </tr>
            <tr>
              <td colSpan={24} className="hd">위 험 유 형</td>
            </tr>
            <tr>
              <td colSpan={3} rowSpan={2} className="hd">유 형</td>
              {HAZARD_GROUPS.map((g) => (
                <td key={g.label} colSpan={g.types.length} className="hd">{g.label}</td>
              ))}
              <td colSpan={3} rowSpan={4} className="nb" />
            </tr>
            <tr>
              {HAZARD_TYPES.map((t) => (
                <td key={t} className="hd" style={{ fontSize: "7pt" }}>{t}</td>
              ))}
            </tr>
            <tr>
              <td colSpan={3} className="lbl">발생건수</td>
              {HAZARD_TYPES.map((t) => (
                <td key={t} className="c mono">{agg.count[t] || ""}</td>
              ))}
            </tr>
            <tr>
              <td colSpan={3} className="lbl">최대위험도</td>
              {HAZARD_TYPES.map((t) => (
                <td key={t} className="c mono" style={{ fontWeight: 700, ...riskCell(agg.max[t] || null) }}>{agg.max[t] || ""}</td>
              ))}
            </tr>
          </tbody>
        </table>
        <div className="paper-foot">
          <span>양식 CF112-02(갑), R02</span>
          <span>삼영순화주식회사</span>
          <span>A4(297×210)</span>
        </div>
      </div>

      {/* ------------------------- 상세표 (을) ------------------------- */}
      <div className="paper-page">
        <table className="paper small">
          <colgroup>
            {detailWidths.map((w, i) => (
              <col key={i} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>번호</th>
              <th colSpan={4}>작업 내용</th>
              <th colSpan={3}>유해위험요인(Hazards)</th>
              <th rowSpan={2} colSpan={3}>현재안전조치</th>
              <th colSpan={3}>통제 전 위험도 평가</th>
              <th rowSpan={2}>개선<br />번호</th>
              <th rowSpan={2} colSpan={4}>감소 대책(Control)</th>
              <th rowSpan={2}>개선<br />목표일</th>
              <th rowSpan={2}>조치<br />담당자</th>
              <th colSpan={3}>통제 후 위험도 평가</th>
              <th rowSpan={2}>완료일</th>
            </tr>
            <tr>
              <th>분류</th>
              <th colSpan={3}>내용</th>
              <th>유형</th>
              <th colSpan={2}>내용</th>
              <th>빈도</th>
              <th>강도</th>
              <th>위험도</th>
              <th>빈도</th>
              <th>강도</th>
              <th>위험도</th>
            </tr>
          </thead>
          <tbody>
            {f.steps.map((s, i) => {
              const c = s.control;
              const post = c.needed ? riskOf(c.postFreq, c.postSev) : null;
              const rs = Math.max(1, s.hazards.length);
              return s.hazards.map((h, j) => {
                const r = riskOf(h.freq, h.sev);
                const first = j === 0;
                return (
                  <tr key={`${i}-${j}`}>
                    {first && <td rowSpan={rs} className="c mono">{i + 1}</td>}
                    {first && <td rowSpan={rs} className="c">{s.cat}</td>}
                    {first && <td rowSpan={rs} colSpan={3} className="pre">{s.content}</td>}
                    <td className="c">{h.type}</td>
                    <td colSpan={2}>{h.content}</td>
                    {first && <td rowSpan={rs} colSpan={3} className="pre">{s.safe}</td>}
                    <td className="c">{h.freq}</td>
                    <td className="c">{h.sev}</td>
                    <td className="c mono" style={{ fontWeight: 700, ...riskCell(r) }}>{r ?? ""}</td>
                    {first && <td rowSpan={rs} className="c mono">{c.needed ? c.impNo : ""}</td>}
                    {first && (
                      <td rowSpan={rs} colSpan={4} className="pre" style={{ fontSize: "7pt", lineHeight: 1.5 }}>
                        {c.needed ? `${CONTROL_OPTS.map((o) => `${c.checks.includes(o) ? "☑" : "☐"} ${o}`).join("\n")}${c.desc ? `\n${c.desc}` : ""}` : ""}
                      </td>
                    )}
                    {first && <td rowSpan={rs} className="c">{c.needed && c.target ? fmtDate(c.target) : ""}</td>}
                    {first && <td rowSpan={rs} className="c">{c.needed ? c.owner : ""}</td>}
                    {first && <td rowSpan={rs} className="c">{c.needed ? c.postFreq : ""}</td>}
                    {first && <td rowSpan={rs} className="c">{c.needed ? c.postSev : ""}</td>}
                    {first && <td rowSpan={rs} className="c mono" style={{ fontWeight: 700, ...riskCell(post) }}>{post ?? ""}</td>}
                    {first && <td rowSpan={rs} className="c">{c.needed && c.done ? fmtDate(c.done) : ""}</td>}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
        <div className="paper-foot">
          <span>양식 CF112-02(을), R02</span>
          <span>삼영순화주식회사</span>
          <span>A4(297×210)</span>
        </div>
      </div>
    </div>
  );
}
