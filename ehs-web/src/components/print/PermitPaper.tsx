/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { CHK, SUPP_TYPES, type ChkGroup, type PermitApply, type PermitField, type SigKey } from "@/lib/permit";

// CF430-01 R04 인쇄 복제본 (A4 가로 2페이지) — 필요 ☑ / 현장 확인 Ⓥ
export function PermitPaper({ p, f, permitNo, issuedAt, stamps }: {
  p: PermitApply;
  f: PermitField;
  permitNo: string;
  issuedAt: string;
  stamps: Record<"담당" | "검토" | "협조" | "승인", string[]>;
}) {
  const need = p.checks;
  const ok = f.checks_ok;
  const has = (k: string) => p.supp.includes(k as PermitApply["supp"][number]);
  const cols = <colgroup>{Array.from({ length: 24 }, (_, i) => <col key={i} style={{ width: `${100 / 24}%` }} />)}</colgroup>;

  // ☑/☐ + (2단 항목이면 Ⓥ/○) + 라벨
  const ck = (on: boolean, label: string, confirm?: boolean | null) => (
    <span key={label} style={{ display: "inline-block", whiteSpace: "nowrap", margin: "0 7pt 1pt 0", fontWeight: on ? 700 : 400 }}>
      {on ? "☑" : "☐"}
      {confirm !== null && confirm !== undefined && <span style={{ letterSpacing: 1 }}>{confirm ? "Ⓥ" : "○"}</span>} {label}
    </span>
  );
  const group = (g: ChkGroup, twoStage = true) => CHK[g].map((label, i) => ck(!!need[`${g}_${i}`] || (!twoStage && !!ok[`${g}_${i}`]), label, twoStage ? !!ok[`${g}_${i}_ok`] : null));
  const single = (g: ChkGroup) => CHK[g].map((label, i) => ck(!!ok[`${g}_${i}`], label));
  const na = <span style={{ color: "#888" }}>해당없음</span>;
  const sigImg = (k: SigKey, h = "15mm") => (f.sigs[k] ? <img src={f.sigs[k]} alt="" style={{ maxWidth: "100%", maxHeight: h, objectFit: "contain" }} /> : null);
  const stamp = (k: keyof typeof stamps) => <span className="pre" style={{ fontSize: "7.4pt" }}>{stamps[k].join("\n")}</span>;
  const people = (list: PermitApply["managers"]) => list.filter((m) => m.name);
  const dt = (v: string) => v.replace("T", " ");
  const endLabel = p.end_dt.slice(0, 10) === p.start_dt.slice(0, 10) ? p.end_dt.slice(11) : dt(p.end_dt);
  const filled = <T extends Record<string, string>>(rows: T[], keys: (keyof T)[]) => rows.filter((r) => keys.some((k) => r[k]));

  const fire = filled(f.fire_logs, ["material", "result", "time", "by"]);
  const conf = filled(f.confined_logs, ["inout", "time", "name", "record", "count"]);
  const acks = f.acks.filter((a) => a.name || a.sig);

  return (
    <>
      {/* ---------------- 1페이지 ---------------- */}
      <div className="paper-page">
        <table className="paper">
          {cols}
          <tbody>
            <tr>
              <L>PSM<br />변경관리</L>
              <V c={4}>{ck(p.psm === "해당", "해당")}</V>
              <V c={2}>{ck(p.psm === "미해당", "미해당")}</V>
              <td colSpan={8} rowSpan={4} className="title" style={{ fontSize: "19pt", letterSpacing: 2 }}>■ 안전작업 허가서 ■</td>
              {(["담당", "검토", "협조", "승인"] as const).map((r) => (
                <td key={r} colSpan={2} rowSpan={2} className="hd">{r}</td>
              ))}
            </tr>
            <tr>
              <L>가동전점검</L>
              <V c={4}>{ck(p.preop === "해당", "해당")}</V>
              <V c={2}>{ck(p.preop === "미해당", "미해당")}</V>
            </tr>
            <tr>
              <L>허가번호</L>
              <V c={6} mono>{permitNo}</V>
              {(["담당", "검토", "협조", "승인"] as const).map((r) => (
                <td key={r} colSpan={2} rowSpan={2} className="sig">{stamp(r)}</td>
              ))}
            </tr>
            <tr>
              <L>허가일시</L>
              <V c={6}>{issuedAt}</V>
            </tr>
            <tr>
              <L>작업일시</L>
              <V c={6}>시작 {dt(p.start_dt)} ~ 종료 {endLabel}</V>
              <L c={3}>작업 종류</L>
              <V c={4}>{ck(p.work_type === "일반위험", "일반위험")}{ck(p.work_type === "화기", "화기")}</V>
              <L c={3}>보충작업허가</L>
              <V c={6}>{SUPP_TYPES.map((s) => ck(has(s.key), s.value))}</V>
            </tr>
            <tr>
              <L>작 업 명</L>
              <V c={5}>{p.work_name}</V>
              <L>작업장소</L>
              <V c={4}>{p.work_place}</V>
              <L c={3}>설비 번호(Tag No)</L>
              <V c={3}>{p.tags.filter((t) => t.name || t.tag).map((t) => `${t.name}${t.tag ? `(${t.tag})` : ""}`).join(", ")}</V>
              <L>위험 등급</L>
              <V c={3}>{p.grade && `${p.grade}등급`}</V>
            </tr>
            <tr>
              <L>작업관리자</L>
              <L c={3}>소속/이름</L>
              <V c={7}>{people(p.managers).map((m) => `${m.org ? `${m.org}/` : ""}${m.name}`).join(" · ")}</V>
              <L>연락처</L>
              <V c={4}>{people(p.managers).map((m) => m.phone).filter(Boolean).join(", ")}</V>
              <L c={3}>연장 시간</L>
              <V c={3}>
                {f.extends.map((e) => (
                  <div key={e.id}>{[e.reason, e.time].filter(Boolean).join(" / ")}</div>
                ))}
              </V>
            </tr>
            <tr>
              <L>입회자</L>
              <L c={3}>소속/이름</L>
              <V c={7}>{people(p.witnesses).map((m) => `${m.org ? `${m.org}/` : ""}${m.name}`).join(" · ")}</V>
              <L>연락처</L>
              <V c={4}>{people(p.witnesses).map((m) => m.phone).filter(Boolean).join(", ")}</V>
              <L c={3}>연장 허가</L>
              <V c={3}>
                {f.extends.map((e) => (
                  <div key={e.id}>
                    {e.approver}
                    {e.sig ? <img src={e.sig} alt="" style={{ height: "6mm", verticalAlign: "middle" }} /> : e.approver ? " (인)" : ""}
                  </div>
                ))}
              </V>
            </tr>
            <tr>
              <td colSpan={16} className="note" style={{ fontSize: "7.6pt", fontStyle: "italic" }}>* 필요한 부분에 ☑표시, 확인은 Ⓥ표시</td>
              <td colSpan={8} className="hd">현장 안전조치 확인 (서명)</td>
            </tr>
            <tr>
              <L r={9} v>작 업 전</L>
              <L c={3}>문서</L>
              <V c={11}>
                {group("docs")}
                {ck(!!need.docs_proc, `작업절차서 ※번호:${p.fields.proc_no || "-"}`, !!ok.docs_proc_ok)}
                {ck(!!need.docs_risk, `위험성평가서 ※번호:${p.fields.risk_no || "-"}`, !!ok.docs_risk_ok)}
              </V>
              <L r={2}>작업<br />관리자</L>
              <td colSpan={6} rowSpan={2} className="sig">{sigImg("prework_mgr")}</td>
            </tr>
            <tr>
              <L c={3}>안전보호구</L>
              <V c={11}>
                {group("ppe")}
                {p.fields.ppe_etc && ck(true, `기타: ${p.fields.ppe_etc}`)}
              </V>
            </tr>
            <tr>
              <L c={3}>일반 및 화기</L>
              <V c={11}>{group("general")}</V>
              <L r={2}>입회자</L>
              <td colSpan={6} rowSpan={2} className="sig">{sigImg("prework_wit")}</td>
            </tr>
            <tr>
              <L c={3}>밀폐</L>
              <V c={11}>{has("confined") ? group("confined") : na}</V>
            </tr>
            <tr>
              <L c={3}>정전</L>
              <V c={11}>
                {has("power") ? (
                  <>
                    전원차단 후 차단장치 시건 또는 꼬리표 부착: {ck(!!need.power1_0, "제어실", !!ok.power1_0_ok)} / {ck(!!need.power1_1, "현장", !!ok.power1_1_ok)} {ck(!!need.power1_2, "정전상태 확인", !!ok.power1_2_ok)}
                    <br />
                    차단기기 : 제어실({p.fields.power_ctrl_room}) / 현장({p.fields.power_field})
                    <br />
                    전원복구 : 모든 작업이 완료된 후 작업관리자의 요청에 의해서만 전원을 복구하여야 한다.
                    <br />※ 전원복구 : 복구시간({dt(f.fields.power_restore_time)}) 확인자({f.fields.power_restore_by})
                  </>
                ) : (
                  na
                )}
              </V>
              <L r={5}>EHS</L>
              <td colSpan={6} rowSpan={5} className="sig">{sigImg("prework_ehs", "30mm")}</td>
            </tr>
            <tr>
              <L c={3}>굴착</L>
              <V c={11}>
                {has("excavation") ? (
                  <>
                    설비 : {ck(!!ok.excGas, `가스, 기계, 소방배관 ※검토자:${f.fields.exc_gas_by || "-"}`)} {ck(!!ok.excElec, `전기, 계장, 통신 ※검토자:${f.fields.exc_elec_by || "-"}`)}
                  </>
                ) : (
                  na
                )}
              </V>
            </tr>
            <tr>
              <L c={3}>방사선</L>
              <V c={11}>{has("radiation") ? group("radiation") : na}</V>
            </tr>
            <tr>
              <L c={3}>고소</L>
              <V c={11}>{has("height") ? group("height") : na}</V>
            </tr>
            <tr>
              <L c={3}>중장비</L>
              <V c={11}>
                {has("heavy") ? (
                  <>
                    장비명 : ({p.fields.heavy_equip}) {group("heavy")}
                    <br />※ 운전원 : ({p.fields.heavy_operator})
                  </>
                ) : (
                  na
                )}
              </V>
            </tr>
          </tbody>
        </table>
        <Foot />
      </div>

      {/* ---------------- 2페이지 ---------------- */}
      <div className="paper-page">
        <table className="paper">
          {cols}
          <tbody>
            <tr>
              <td colSpan={16} style={{ fontSize: "7.6pt", fontStyle: "italic" }}>* 필요한 부분에 ☑표시, 확인은 Ⓥ표시</td>
              <td colSpan={8} className="hd">현장 안전조치 확인 (서명)</td>
            </tr>
            <tr>
              <L c={3} r={2}>작업<br />중단 후<br />개시</L>
              <L c={3}>작업중단 시간</L>
              <V c={12}>{f.suspends.map((s) => [s.stop, s.resume, s.reason].filter(Boolean).join(" / ")).filter(Boolean).join("; ")}</V>
              <L>작업<br />관리자</L>
              <td colSpan={4} className="sig">{sigImg("suspend_mgr")}</td>
            </tr>
            <tr>
              <L c={3}>안전상태</L>
              <V c={12}>{single("resume")}</V>
              <L>입회자</L>
              <td colSpan={4} className="sig">{sigImg("suspend_wit")}</td>
            </tr>
            <tr>
              <L c={3} r={2}>작업완료</L>
              <L c={3}>작업완료 시간</L>
              <V c={12}>{dt(f.fields.complete_time)}</V>
              <L>작업<br />관리자</L>
              <td colSpan={4} className="sig">{sigImg("complete_mgr")}</td>
            </tr>
            <tr>
              <L c={3}>완료확인</L>
              <V c={12}>{single("complete")}</V>
              <L>입회자</L>
              <td colSpan={4} className="sig">{sigImg("complete_wit")}</td>
            </tr>
          </tbody>
        </table>

        {p.work_type === "화기" && (
          <LogTable
            caption="☐ 화기작업 시 농도측정 기록 (측정주기 : 작업 전, 작업교대, 휴식 후 재작업 시, 작업자 및 환기장치 이상 시 등)  •  기준 : 인화성물질 LEL 25%, 독성물질 TWA 미만"
            groups={2}
            head={["No", "물질명", "측정결과", "측정시간", "측정자"]}
            widths={[5, 11.25, 11.25, 11.25, 11.25]}
            rows={fire.map((r) => [r.material, r.result, r.time, r.by])}
            minRows={3}
          />
        )}
        {has("confined") && (
          <LogTable
            caption="☐ 밀폐공간출입 기록 (측정주기 : 작업 전, 점심식사 후, 휴식 후 등 작업에 관계된 모든 근로자가 작업장소를 떠난 후 다시 돌아와 작업하기 전)"
            captionRight="• 허가농도 기준 O₂: 18%이상 23.5%미만 / CO: 30ppm미만 / CO₂: 1.5%미만 / H₂S: 10ppm미만"
            groups={2}
            head={["No", "입장/퇴장", "시간", "이름", "산소·유해가스 농도 측정기록", "밀폐공간 내 인원"]}
            widths={[4, 7, 6, 8, 16, 9]}
            rows={conf.map((r) => [r.inout, r.time, r.name, r.record, r.count])}
            minRows={4}
          />
        )}
        <LogTable
          caption="☐ 작업자 확인 서명 (MSDS 숙지, 비상대피로 및 세안시설 위치, 보호구 착용 및 방법, 작업절차 또는 위험성평가 등)"
          groups={4}
          head={["No", "성명", "서명"]}
          widths={[3, 9.5, 12]}
          rows={acks.map((a) => [a.name, a.sig ? <img key="s" src={a.sig} alt="" style={{ height: "7mm" }} /> : ""])}
          minRows={3}
          columnMajor
        />
        <Foot />
      </div>
    </>
  );
}

function L({ c = 2, r, children, v }: { c?: number; r?: number; children: ReactNode; v?: boolean }) {
  return <td colSpan={c} rowSpan={r} className={`lbl ${v ? "vert" : ""}`}>{children}</td>;
}

function V({ c, r, children, mono }: { c: number; r?: number; children?: ReactNode; mono?: boolean }) {
  return <td colSpan={c} rowSpan={r} className={mono ? "mono" : ""}>{children}</td>;
}

function Foot() {
  return (
    <div className="paper-foot">
      <span>양식 CF430-01, R04</span>
      <span>삼영순화주식회사</span>
      <span>A4(297×210)</span>
    </div>
  );
}

// 좌우(또는 4묶음) 나란히 배치하는 기록표
function LogTable({ caption, captionRight, groups, head, widths, rows, minRows, columnMajor }: {
  caption: string;
  captionRight?: string;
  groups: number;
  head: string[];
  widths: number[];
  rows: ReactNode[][];
  minRows: number;
  columnMajor?: boolean;
}) {
  const perGroup = Math.max(minRows, Math.ceil(rows.length / groups));
  const cell = (row: number, g: number) => {
    const idx = columnMajor ? row + g * perGroup : row + g * perGroup;
    return { idx, data: rows[idx] };
  };
  return (
    <table className="paper small" style={{ marginTop: "3mm" }}>
      <caption style={{ captionSide: "top", textAlign: "left", fontSize: "8.4pt", fontWeight: 700, padding: "2mm 0 1mm" }}>
        {caption}
        {captionRight && <span style={{ display: "block", textAlign: "right", fontWeight: 500 }}>{captionRight}</span>}
      </caption>
      <colgroup>
        {Array.from({ length: groups }).flatMap((_, g) => widths.map((w, i) => <col key={`${g}-${i}`} style={{ width: `${w}%` }} />))}
      </colgroup>
      <thead>
        <tr>{Array.from({ length: groups }).flatMap((_, g) => head.map((h) => <th key={`${g}-${h}`}>{h}</th>))}</tr>
      </thead>
      <tbody>
        {Array.from({ length: perGroup }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: groups }).flatMap((_, g) => {
              const { idx, data } = cell(r, g);
              return [
                <td key={`${g}-no`} className="c">{idx + 1}</td>,
                ...head.slice(1).map((_, i) => (
                  <td key={`${g}-${i}`} className="c" style={{ height: "7mm" }}>{data?.[i] ?? ""}</td>
                )),
              ];
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
