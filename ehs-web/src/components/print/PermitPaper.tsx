/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { chkItems, SUPP_TYPES, type ChkGroup, type PermitApply, type PermitField, type SigKey } from "@/lib/permit";

// CF430-01 R05 인쇄 복제본 (A4 가로 2페이지) — 필요 ☑ / 현장 확인 Ⓥ
//   칸 너비는 표준양식(R05)의 칸 경계(가로 1120 기준 x 좌표)를 그대로 옮김 → span(시작, 끝) 으로 colSpan 계산
//   보충작업을 고르지 않아도 양식처럼 항목을 모두 인쇄 (체크만 비어 있음) · 농도측정·밀폐공간 기록표도 항상 인쇄
const X1 = [10, 75, 110, 150, 165, 205, 255, 360, 455, 540, 645, 750, 790, 835, 850, 920, 960, 975, 990, 1010, 1050, 1060, 1130];
const X2 = [10, 75, 150, 285, 960, 1010, 1130];
const colsOf = (xs: number[]) => (
  <colgroup>
    {xs.slice(1).map((x, i) => (
      <col key={x} style={{ width: `${((x - xs[i]) / (xs[xs.length - 1] - xs[0])) * 100}%` }} />
    ))}
  </colgroup>
);
const spanOf = (xs: number[]) => (a: number, b: number) => {
  const n = xs.indexOf(b) - xs.indexOf(a);
  if (xs.indexOf(a) < 0 || n <= 0) throw new Error(`칸 경계 없음 : ${a}~${b}`);
  return n;
};
const s1 = spanOf(X1);
const s2 = spanOf(X2);

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

  // ☑/☐ + (2단 항목이면 Ⓥ/○) + 라벨
  const ck = (on: boolean, label: string, confirm?: boolean | null) => (
    <span key={label} style={{ display: "inline-block", whiteSpace: "nowrap", margin: "0 9pt 1pt 0", fontWeight: on ? 700 : 400 }}>
      {on ? "☑" : "☐"}
      {confirm !== null && confirm !== undefined && <span style={{ letterSpacing: 1 }}>{confirm ? "Ⓥ" : "○"}</span>} {label}
    </span>
  );
  const group = (g: ChkGroup) => chkItems(g).map(({ i, label }) => ck(!!need[`${g}_${i}`], label, !!ok[`${g}_${i}_ok`]));
  const single = (g: ChkGroup) => chkItems(g).map(({ i, label }) => ck(!!ok[`${g}_${i}`], label));
  // ( 값 ) : 비어 있으면 양식처럼 밑줄 빈칸
  const blank = (v: string, w = "24mm") => (
    <>
      (<span style={{ display: "inline-block", minWidth: w, borderBottom: ".5pt solid #000", textAlign: "center" }}>{v}</span>)
    </>
  );
  const sigImg = (k: SigKey, h = "15mm") => (f.sigs[k] ? <img src={f.sigs[k]} alt="" style={{ maxWidth: "100%", maxHeight: h, objectFit: "contain" }} /> : null);
  const stamp = (k: keyof typeof stamps) => <span className="pre" style={{ fontSize: "7.4pt" }}>{stamps[k].join("\n")}</span>;
  const people = (list: PermitApply["managers"]) => list.filter((m) => m.name);
  const dt = (v: string) => v.replace("T", " ");
  const endLabel = p.end_dt.slice(0, 10) === p.start_dt.slice(0, 10) ? p.end_dt.slice(11) : dt(p.end_dt);
  const filled = <T extends Record<string, string>>(rows: T[], keys: (keyof T)[]) => rows.filter((r) => keys.some((k) => r[k]));
  const personRow = (list: PermitApply["managers"]) => (
    <>
      <span style={{ marginRight: "6pt" }}>소속 / 이름</span>
      {people(list).map((m) => `${m.org ? `${m.org} / ` : ""}${m.name}`).join(" · ")}
    </>
  );

  const fire = filled(f.fire_logs, ["material", "result", "time", "by"]);
  const conf = filled(f.confined_logs, ["inout", "time", "name", "record", "count"]);
  const acks = f.acks.filter((a) => a.name || a.sig);

  return (
    <>
      {/* ---------------- 1페이지 ---------------- */}
      <div className="paper-page">
        <table className="paper">
          {colsOf(X1)}
          <tbody>
            <tr>
              <L c={s1(10, 75)}>PSM<br />변경관리</L>
              <V c={s1(75, 165)}>{ck(p.psm === "해당", "해당")}</V>
              <V c={s1(165, 255)}>{ck(p.psm === "미해당", "미해당")}</V>
              <td colSpan={s1(255, 850)} rowSpan={4} className="title" style={{ fontSize: "20pt", letterSpacing: 2 }}>■ 안전작업 허가서 ■</td>
              {(["담당", "검토", "협조", "승인"] as const).map((r, i) => (
                <td key={r} colSpan={s1([850, 920, 990, 1060][i], [920, 990, 1060, 1130][i])} className="hd">{r}</td>
              ))}
            </tr>
            <tr>
              <L c={s1(10, 75)} small>가동전점검</L>
              <V c={s1(75, 165)}>{ck(p.preop === "해당", "해당")}</V>
              <V c={s1(165, 255)}>{ck(p.preop === "미해당", "미해당")}</V>
              {(["담당", "검토", "협조", "승인"] as const).map((r, i) => (
                <td key={r} colSpan={s1([850, 920, 990, 1060][i], [920, 990, 1060, 1130][i])} rowSpan={3} className="sig">{stamp(r)}</td>
              ))}
            </tr>
            <tr>
              <L c={s1(10, 75)}>허가번호</L>
              <V c={s1(75, 255)} mono>{permitNo}</V>
            </tr>
            <tr>
              <L c={s1(10, 75)}>허가일시</L>
              <V c={s1(75, 255)}>{issuedAt}</V>
            </tr>
            <tr>
              <L c={s1(10, 75)}>작업일시</L>
              <V c={s1(75, 360)}>시작 {dt(p.start_dt)} ~ 종료 {endLabel}</V>
              <L c={s1(360, 455)}>작업 종류</L>
              <V c={s1(455, 645)}>{ck(p.work_type === "일반위험", "일반위험")}{ck(p.work_type === "화기", "화기")}</V>
              <L c={s1(645, 750)}>보충작업허가</L>
              <V c={s1(750, 1130)}>{SUPP_TYPES.map((s) => ck(has(s.key), s.value))}</V>
            </tr>
            <tr>
              <L c={s1(10, 75)}>작 업 명</L>
              <V c={s1(75, 360)}>{p.work_name}</V>
              <L c={s1(360, 455)}>작업장소</L>
              <V c={s1(455, 645)}>{p.work_place}</V>
              <L c={s1(645, 790)}>설비 번호(Tag No)</L>
              <V c={s1(790, 975)}>{p.tags.filter((t) => t.name || t.tag).map((t) => `${t.name}${t.tag ? `(${t.tag})` : ""}`).join(", ")}</V>
              <L c={s1(975, 1050)}>위험 등급</L>
              <V c={s1(1050, 1130)}>{p.grade && `${p.grade}등급`}</V>
            </tr>
            <tr>
              <L c={s1(10, 110)}>작업관리자</L>
              <V c={s1(110, 455)}>{personRow(p.managers)}</V>
              <L c={s1(455, 540)}>연락처</L>
              <V c={s1(540, 750)}>{people(p.managers).map((m) => m.phone).filter(Boolean).join(", ")}</V>
              <L c={s1(750, 835)}>연장 시간</L>
              <V c={s1(835, 1130)}>
                {f.extends.map((e) => (
                  <div key={e.id}>{[e.reason, e.time].filter(Boolean).join(" / ")}</div>
                ))}
              </V>
            </tr>
            <tr>
              <L c={s1(10, 110)}>입회자</L>
              <V c={s1(110, 455)}>{personRow(p.witnesses)}</V>
              <L c={s1(455, 540)}>연락처</L>
              <V c={s1(540, 750)}>{people(p.witnesses).map((m) => m.phone).filter(Boolean).join(", ")}</V>
              <L c={s1(750, 835)}>연장 허가</L>
              <V c={s1(835, 1130)}>
                {f.extends.map((e) => (
                  <div key={e.id}>
                    {e.approver}
                    {e.sig ? <img src={e.sig} alt="" style={{ height: "6mm", verticalAlign: "middle" }} /> : e.approver ? " (인)" : ""}
                  </div>
                ))}
                {f.extends.length === 0 && <div style={{ textAlign: "right" }}>(인)</div>}
              </V>
            </tr>
            <tr>
              <L c={s1(10, 75)} r={10}>작업 전</L>
              <td colSpan={s1(75, 960)} style={{ fontSize: "7.6pt" }}>* 필요한 부분에 ☑표시, 확인은 Ⓥ표시</td>
              <td colSpan={s1(960, 1130)} className="lbl">현장 안전조치 확인 (서명)</td>
            </tr>
            <tr>
              <L c={s1(75, 150)}>문서</L>
              <V c={s1(150, 960)}>
                {group("docs")}
                <br />
                {ck(!!need.docs_proc, "작업절차서", !!ok.docs_proc_ok)}※ 번호 : {blank(p.fields.proc_no, "40mm")}
                <span style={{ marginLeft: "12pt" }}>{ck(!!need.docs_risk, "위험성 평가서", !!ok.docs_risk_ok)}※ 번호 : {blank(p.fields.risk_no, "40mm")}</span>
              </V>
              <L c={s1(960, 1010)} r={2}>작업<br />관리자</L>
              <td colSpan={s1(1010, 1130)} rowSpan={2} className="sig">{sigImg("prework_mgr")}</td>
            </tr>
            <tr>
              <L c={s1(75, 150)}>안전<br />보호구</L>
              <V c={s1(150, 960)}>
                {group("ppe")}
                <br />
                {ck(!!p.fields.ppe_etc, "기타 :")} {blank(p.fields.ppe_etc, "30mm")}
              </V>
            </tr>
            <tr>
              <L c={s1(75, 150)} r={7}>안전조치<br />요구사항</L>
              <L c={s1(150, 205)}>일반<br />및<br />화기</L>
              <V c={s1(205, 960)}>{group("general")}</V>
              <L c={s1(960, 1010)} r={2}>입회자</L>
              <td colSpan={s1(1010, 1130)} rowSpan={2} className="sig">{sigImg("prework_wit")}</td>
            </tr>
            <tr>
              <L c={s1(150, 205)}>밀폐</L>
              <V c={s1(205, 960)}>{group("confined")}</V>
            </tr>
            <tr>
              <L c={s1(150, 205)}>정전</L>
              <V c={s1(205, 960)}>
                전원차단 후 차단장치 시건 또는 꼬리표 부착 : {ck(!!need.power1_0, "제어실", !!ok.power1_0_ok)}/ {ck(!!need.power1_1, "현장", !!ok.power1_1_ok)}
                {ck(!!need.power1_2, "정전상태 확인", !!ok.power1_2_ok)}
                <br />
                차단기기 : 제어실{blank(p.fields.power_ctrl_room)} / 현장{blank(p.fields.power_field)}
                <br />
                전원복구 : 모든 작업이 완료된 후 작업관리자의 요청에 의해서만 전원을 복구하여야 한다.
                <br />※ 전원복구 : 복구시간 {blank(dt(f.fields.power_restore_time), "30mm")} 확인자 : {blank(f.fields.power_restore_by)}
              </V>
              <L c={s1(960, 1010)} r={5}>EHS</L>
              <td colSpan={s1(1010, 1130)} rowSpan={5} className="sig">{sigImg("prework_ehs", "30mm")}</td>
            </tr>
            <tr>
              <L c={s1(150, 205)}>굴착</L>
              <V c={s1(205, 960)}>
                설비 : {ck(!!ok.excGas, "가스, 기계, 소방배관")}※ 검토자 : {blank(f.fields.exc_gas_by)}
                <span style={{ marginLeft: "12pt" }}>{ck(!!ok.excElec, "전기, 계장, 통신")}※ 검토자 : {blank(f.fields.exc_elec_by)}</span>
              </V>
            </tr>
            <tr>
              <L c={s1(150, 205)}>방사선</L>
              <V c={s1(205, 960)}>{group("radiation")}</V>
            </tr>
            <tr>
              <L c={s1(150, 205)}>고소</L>
              <V c={s1(205, 960)}>{group("height")}</V>
            </tr>
            <tr>
              <L c={s1(150, 205)}>중장비</L>
              <V c={s1(205, 960)}>
                장비명 : {blank(p.fields.heavy_equip, "40mm")}
                <span style={{ margin: "0 9pt" }}>※ 운전원 : {blank(p.fields.heavy_operator, "40mm")}</span>
                {group("heavy")}
              </V>
            </tr>
          </tbody>
        </table>
        <Foot />
      </div>

      {/* ---------------- 2페이지 ---------------- */}
      <div className="paper-page">
        <table className="paper">
          {colsOf(X2)}
          <tbody>
            <tr>
              <td colSpan={s2(10, 960)} style={{ fontSize: "7.6pt" }}>* 필요한 부분에 ☑표시, 확인은 Ⓥ표시</td>
              <td colSpan={s2(960, 1130)} className="lbl">현장 안전조치 확인 (서명)</td>
            </tr>
            <tr>
              <L c={s2(10, 75)} r={2}>작업<br />중단 후<br />개시</L>
              <L c={s2(75, 285)}>작업중단 시간</L>
              <V c={s2(285, 960)}>{f.suspends.map((s) => [s.stop, s.resume, s.reason].filter(Boolean).join(" / ")).filter(Boolean).join("; ")}</V>
              <L c={s2(960, 1010)}>작업<br />관리자</L>
              <td colSpan={s2(1010, 1130)} className="sig">{sigImg("suspend_mgr")}</td>
            </tr>
            <tr>
              <L c={s2(75, 150)}>안전상태</L>
              <V c={s2(150, 960)}>{single("resume")}</V>
              <L c={s2(960, 1010)}>입회자</L>
              <td colSpan={s2(1010, 1130)} className="sig">{sigImg("suspend_wit")}</td>
            </tr>
            <tr>
              <L c={s2(10, 75)} r={2}>작업<br />완료</L>
              <L c={s2(75, 285)}>작업완료 시간</L>
              <V c={s2(285, 960)}>{dt(f.fields.complete_time)}</V>
              <L c={s2(960, 1010)}>작업<br />관리자</L>
              <td colSpan={s2(1010, 1130)} className="sig">{sigImg("complete_mgr")}</td>
            </tr>
            <tr>
              <L c={s2(75, 150)}>완료확인</L>
              <V c={s2(150, 960)}>{single("complete")}</V>
              <L c={s2(960, 1010)}>입회자</L>
              <td colSpan={s2(1010, 1130)} className="sig">{sigImg("complete_wit")}</td>
            </tr>
          </tbody>
        </table>

        <LogTable
          caption="☐ 화기작업 시 농도측정 기록 (측정주기 : 작업 전, 작업교대, 휴식 후 재작업 시, 작업자 및 환기장치 이상 시 등)  •  기준 : 인화성물질 LEL 25%, 독성물질 TWA 미만"
          groups={2}
          head={["No", "물질명", "측정 결과", "측정 시간", "측정자"]}
          widths={[2.7, 12.5, 11.4, 11.4, 12]}
          rows={fire.map((r) => [r.material, r.result, r.time, r.by])}
          minRows={3}
        />
        <LogTable
          caption="☐ 밀폐공간출입 기록 (측정주기 : 작업 전, 점심식사 후, 휴식 후 등 작업에 관계된 모든 근로자가 작업장소를 떠난 후 다시 돌아와 작업하기 전)"
          captionRight="• 허가농도 기준 O₂: 18%이상 23.5%미만 / CO: 30ppm미만 / CO₂: 1.5%미만 / H₂S: 10ppm미만"
          groups={2}
          head={["No", "입장 / 퇴장", "시간", "이름", "산소 및 유해가스 농도 측정 기록", "밀폐공간 내 인원"]}
          widths={[2.7, 4.6, 5.4, 12.3, 18.8, 6.2]}
          rows={conf.map((r) => [r.inout, r.time, r.name, r.record, r.count])}
          minRows={4}
        />
        <LogTable
          caption="☐ 작업자 교육 서명 (MSDS 숙지, 비상대피로 및 세안시설 위치, 보호구 착용 및 방법, 작업절차 또는 위험성 평가 등)"
          groups={4}
          head={["No", "성명", "서명"]}
          widths={[3, 11.2, 10.8]}
          rows={acks.map((a) => [a.name, a.sig ? <img key="s" src={a.sig} alt="" style={{ height: "7mm" }} /> : ""])}
          minRows={3}
        />
        <Foot />
      </div>
    </>
  );
}

function L({ c, r, small, children }: { c: number; r?: number; small?: boolean; children: ReactNode }) {
  return <td colSpan={c} rowSpan={r} className="lbl" style={small ? { fontSize: "7.4pt", whiteSpace: "nowrap", padding: "2.4pt 1pt" } : undefined}>{children}</td>;
}

function V({ c, r, children, mono }: { c: number; r?: number; children?: ReactNode; mono?: boolean }) {
  return <td colSpan={c} rowSpan={r} className={mono ? "mono" : ""}>{children}</td>;
}

function Foot() {
  return (
    <div className="paper-foot">
      <span>양식 CF430-01, R05</span>
      <span>삼영순화주식회사</span>
      <span>A4(297×210)</span>
    </div>
  );
}

// 좌우(또는 4묶음) 나란히 배치하는 기록표 : 1~n 이 왼쪽 묶음부터 위→아래로 (양식과 같은 번호 순서)
function LogTable({ caption, captionRight, groups, head, widths, rows, minRows }: {
  caption: string;
  captionRight?: string;
  groups: number;
  head: string[];
  widths: number[];
  rows: ReactNode[][];
  minRows: number;
}) {
  const perGroup = Math.max(minRows, Math.ceil(rows.length / groups));
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
              const idx = r + g * perGroup;
              const data = rows[idx];
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
