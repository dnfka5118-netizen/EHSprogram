"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSop, submitSop } from "./actions";
import { ApprovalLineEditor, finalizeLine } from "@/components/approval/ApprovalLineEditor";
import { Button, FormMessage } from "@/components/ui";
import { resolveLine, type DeptHead, type LineStep, type TemplateStep } from "@/lib/approval-line";
import { GRADE_TABLE } from "@/lib/permit";
import { HAZARD_COLS, PURPOSES, emptyStep, type SopForm, type SopStep } from "@/lib/sop";
import { processPhoto, preloadHeic } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";
import type { ActionState } from "@/lib/types";
import type { Person } from "@/lib/approval";
import type { JsaOption } from "../permit/PermitEditor";
import { F, HelpTip, Hint, INPUT, Panel, Pill, Sub } from "../permit/ui";

const MAX_PHOTOS = 4;
const TA = `${INPUT} min-h-[96px] leading-snug`;

// 표준운전절차서 작성 (00 표준 정보 · 01 작업 개요 · 02 유해위험요인 · 03 작업 단계 · 04 제개정 이력)
export function SopEditor({ id, isNew, rev, initial, photoUrls, departments, template, people, meId, jsaOptions, rejectedNote }: {
  id: string;
  isNew?: boolean;
  rev: number;
  initial: SopForm;
  photoUrls: Record<string, string>; // 저장된 사진 경로 → 서명 URL
  departments: DeptHead[];
  template: TemplateStep[];
  people: Person[];
  meId: string;
  jsaOptions: JsaOption[];
  rejectedNote?: string | null;
}) {
  const router = useRouter();
  const [f, setF] = useState<SopForm>(initial);
  const [urls, setUrls] = useState<Record<string, string>>(photoUrls);
  const [state, setState] = useState<ActionState>();
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const fullUrls = useRef<Record<string, string>>({}); // 이번에 올린 사진의 원본 크기 (엑셀 내보내기용 · 화면은 썸네일)
  const [lineEdited, setLineEdited] = useState(false);
  const [line, setLine] = useState<LineStep[]>(() => resolveLine(template, { drafterId: meId, docDepartmentId: initial.department_id || null, depts: departments }));

  const set = (patch: Partial<SopForm>) => setF((x) => ({ ...x, ...patch }));
  const setStep = (i: number, patch: Partial<SopStep>) => setF((x) => ({ ...x, steps: x.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const toggle = (list: string[], v: string, on: boolean) => (on ? [...list.filter((x) => x !== v), v] : list.filter((x) => x !== v));
  const moveStep = (i: number, d: -1 | 1) =>
    setF((x) => {
      const j = i + d;
      if (j < 0 || j >= x.steps.length) return x;
      const s = [...x.steps];
      [s[i], s[j]] = [s[j], s[i]];
      return { ...x, steps: s };
    });

  function changeDept(deptId: string) {
    set({ department_id: deptId });
    if (!lineEdited) setLine(resolveLine(template, { drafterId: meId, docDepartmentId: deptId || null, depts: departments }));
  }

  // 사진 : 고르는 즉시 압축해 docs 버킷 sop/{문서ID}/ 에 올림
  async function addPhotos(i: number, files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PHOTOS - f.steps[i].photos.length;
    const list = [...files].slice(0, Math.max(0, room));
    if (!list.length) return setState({ error: `사진은 단계마다 ${MAX_PHOTOS}장까지 올릴 수 있습니다.` });
    setUploading((n) => n + list.length);
    try {
      const supabase = createClient();
      for (const file of list) {
        const p = await processPhoto(file);
        const path = `sop/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
        const { error } = await supabase.storage.from("docs").upload(path, p.main, { contentType: "image/jpeg" });
        if (error) throw new Error(error.message);
        setUrls((u) => ({ ...u, [path]: p.preview }));
        fullUrls.current[path] = URL.createObjectURL(p.main);
        setF((x) => ({ ...x, steps: x.steps.map((s, j) => (j === i ? { ...s, photos: [...s.photos, path] } : s)) }));
      }
    } catch (e) {
      setState({ error: `사진 올리기 실패 : ${e instanceof Error ? e.message : e}` });
    } finally {
      setUploading((n) => Math.max(0, n - list.length));
    }
  }

  // 연결한 위험성평가(JSA)의 작업 단계를 가져와 채움 (작업단계 · 유해위험요인 · 작업내용 · 안전대책)
  async function importJsaSteps() {
    if (!f.risk_eval_id) return;
    const { data } = await createClient().from("jsa_evals").select("steps").eq("id", f.risk_eval_id).maybeSingle();
    type J = { cat?: string; content?: string; safe?: string; hazards?: { content?: string }[]; control?: { desc?: string } };
    const steps = ((data?.steps ?? []) as J[]).filter((s) => s.content || s.cat);
    if (!steps.length) return setState({ error: "가져올 작업 단계가 없습니다." });
    const hasText = f.steps.some((s) => s.name || s.work);
    if (hasText && !confirm("지금 입력한 작업 단계를 위험성평가의 작업 단계로 바꿀까요? (사진은 지워지지 않고 같은 번호 단계에 남습니다)")) return;
    const num = (xs: string[]) => xs.filter(Boolean).map((x, k) => `${k + 1}. ${x}`).join("\n");
    setF((x) => ({
      ...x,
      steps: steps.map((s, k) => ({
        ...emptyStep(),
        photos: x.steps[k]?.photos ?? [],
        name: s.cat || (s.content ?? "").split("\n")[0].slice(0, 30),
        work: s.content ?? "",
        hazard: num((s.hazards ?? []).map((h) => h.content ?? "")),
        safety: [s.safe, s.control?.desc].filter(Boolean).join("\n"),
      })),
    }));
    setState({ message: `위험성평가의 작업 단계 ${steps.length}개를 가져왔습니다. 내용을 확인해 주세요.` });
  }

  // 엑셀 불러오기 : 양식의 내용 · 단계 사진을 읽어 지금 작성 중인 내용을 대체 (사진은 압축해 올림)
  async function importExcel(file: File) {
    setState(undefined);
    try {
      const { importSopExcel } = await import("@/lib/sop-excel");
      const res = await importSopExcel(file, departments);
      const nPhotos = res.photos.flat().length;
      if (!confirm(`엑셀 파일에서 작업 단계 ${res.form.steps!.length}개${nPhotos ? `, 사진 ${nPhotos}장` : ""}을 찾았습니다.\n불러와서 지금 작성 중인 내용을 대체할까요?`)) return;
      const linkedJsa = res.riskNo ? jsaOptions.find((j) => j.eval_no.replace(/\s/g, "") === res.riskNo.replace(/\s/g, "")) : undefined;
      setUploading((n) => n + nPhotos);
      const supabase = createClient();
      const failed: string[] = [];
      const steps: SopStep[] = [];
      for (const [i, s] of res.form.steps!.entries()) {
        const photos: string[] = [];
        for (const blob of res.photos[i]) {
          try {
            const p = await processPhoto(new File([blob], `sop-${i + 1}.${blob.type.split("/")[1] ?? "jpg"}`, { type: blob.type }));
            const path = `sop/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
            const { error } = await supabase.storage.from("docs").upload(path, p.main, { contentType: "image/jpeg" });
            if (error) throw new Error(error.message);
            setUrls((u) => ({ ...u, [path]: p.preview }));
            fullUrls.current[path] = URL.createObjectURL(p.main);
            photos.push(path);
          } catch {
            failed.push(`${i + 1}단계`);
          } finally {
            setUploading((n) => Math.max(0, n - 1));
          }
        }
        steps.push({ ...s, photos });
      }
      setF((x) => ({
        ...x,
        ...res.form,
        steps,
        department_id: res.form.department_id || x.department_id,
        risk_eval_id: linkedJsa?.id ?? "",
        risk_no: linkedJsa?.eval_no ?? res.riskNo,
        history: res.form.history ?? x.history,
      }));
      if (res.form.department_id) changeDept(res.form.department_id);
      const notes = [...res.notes, ...(failed.length ? [`사진을 올리지 못한 단계가 있습니다 (${[...new Set(failed)].join(", ")}).`] : [])];
      setState({ message: `엑셀 파일을 불러왔습니다. ${notes.join(" ")} 내용을 확인하고 저장해 주세요.` });
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : String(e) });
    }
  }

  async function exportExcel() {
    setState(undefined);
    try {
      const { exportSopExcel } = await import("@/lib/sop-excel");
      await exportSopExcel(f, { rev, departmentName: departments.find((d) => d.id === f.department_id)?.name ?? "", riskNo: linked?.eval_no ?? f.risk_no, photoUrls: { ...urls, ...fullUrls.current } });
    } catch (e) {
      setState({ error: `엑셀 만들기 실패 : ${e instanceof Error ? e.message : e}` });
    }
  }

  const payload = (): SopForm => ({ ...f, steps: f.steps.filter((s) => s.name || s.work || s.photos.length || s.hazard || s.safety || s.standard) });

  function save() {
    setState(undefined);
    start(async () => {
      const res = await saveSop(id, payload());
      if (res.error) return setState({ error: res.error });
      setState({ message: "저장했습니다." });
      if (isNew) router.replace(`/sop/${id}`);
      else router.refresh();
    });
  }

  function submit() {
    setState(undefined);
    const fin = finalizeLine(line, meId);
    if (fin.error) return setState({ error: fin.error });
    start(async () => {
      const res = await submitSop(id, payload(), fin.steps!);
      if (res.error) {
        setState({ error: res.error });
        if (isNew) router.replace(`/sop/${id}`);
        return;
      }
      router.replace(`/sop/${id}?submitted=1`);
      router.refresh();
    });
  }

  const linked = jsaOptions.find((j) => j.id === f.risk_eval_id);

  return (
    <div className="space-y-4 pb-24">
      {rejectedNote && (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <b>반려됨</b> · {rejectedNote} — 내용을 수정한 뒤 다시 상신해 주세요.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={pending || uploading > 0} onClick={() => fileRef.current?.click()}>
          📥 엑셀 불러오기
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xlsm"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importExcel(file);
            e.target.value = "";
          }}
        />
        <Button variant="secondary" disabled={uploading > 0} onClick={exportExcel}>
          📤 엑셀로 내보내기
        </Button>
        <span className="flex items-center gap-1 text-xs text-gray-500">
          안전운전 절차서 양식(CF410-01 R02) · 사진 포함
          <HelpTip text="불러오기 : 엑셀로 작성한 절차서를 고르면 표준명·공정명·유해위험 체크·작업 단계·사진(단계마다 4장까지)을 채웁니다. 내보내기 : 지금 내용을 같은 양식의 엑셀로 내려받습니다." />
        </span>
      </div>

      {/* 00 */}
      <Panel num="00" title="표준 정보">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_440px]">
          <div className="min-w-0 space-y-3">
            <F label="표준명" required>
              <input className={INPUT} value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="예) 원료하역(1공장)" />
            </F>
            <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
              <F label="표준번호" required>
                <input className={`${INPUT} font-mono`} value={f.sop_no} onChange={(e) => set({ sop_no: e.target.value })} placeholder="예) F220-SOP-과수-001" />
              </F>
              <F label="Rev.">
                <input className={`${INPUT} bg-gray-50`} value={rev} readOnly />
              </F>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <F label="공정명" required>
                <input className={INPUT} value={f.process_name} onChange={(e) => set({ process_name: e.target.value })} placeholder="예) 과산화수소" />
              </F>
              <F label="작성부서" required>
                <select className={INPUT} value={f.department_id} onChange={(e) => changeDept(e.target.value)}>
                  <option value="">선택</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </F>
              <F label="작성자">
                <input className={INPUT} value={f.writers} onChange={(e) => set({ writers: e.target.value })} placeholder="예) 이종광, 이정찬" />
              </F>
              <F label="적용범위">
                <input className={INPUT} value={f.scope} onChange={(e) => set({ scope: e.target.value })} placeholder="예) 1공장 원료하역" />
              </F>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <F label="위험성평가 작업번호">
                <select
                  className={INPUT}
                  value={f.risk_eval_id}
                  onChange={(e) => {
                    const j = jsaOptions.find((x) => x.id === e.target.value);
                    set({ risk_eval_id: e.target.value, risk_no: j?.eval_no ?? f.risk_no });
                  }}
                >
                  <option value="">(직접 입력 / 연결 안 함)</option>
                  {jsaOptions.map((j) => (
                    <option key={j.id} value={j.id}>{j.eval_no} · {j.work_name}</option>
                  ))}
                </select>
                {!f.risk_eval_id && (
                  <input className={`${INPUT} mt-1 font-mono`} value={f.risk_no} onChange={(e) => set({ risk_no: e.target.value })} placeholder="번호 직접 입력 (예: 정기26-01)" />
                )}
                {linked && (
                  <button type="button" onClick={importJsaSteps} className="mt-1 text-xs font-medium text-brand-700 hover:underline">
                    ↓ 이 위험성평가의 작업 단계 가져오기
                  </button>
                )}
              </F>
              <F label="위험등급" required>
                <div className="flex gap-2">
                  {(["A", "B", "C"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => set({ grade: g })}
                      className={`rounded-lg border px-4 py-1.5 text-sm ${f.grade === g ? "border-brand-600 bg-brand-50 font-semibold text-brand-800" : "border-gray-300 bg-gray-50"}`}
                    >
                      {g}등급
                    </button>
                  ))}
                </div>
              </F>
            </div>
            <details className="rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-3 py-2">
              <summary className="cursor-pointer text-sm font-semibold text-brand-800">작업별 위험등급 구분기준 보기 (안전작업허가 부표 1)</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-xs">
                  <thead>
                    <tr className="bg-white text-gray-600">
                      {["구분", "A등급", "B등급", "C등급"].map((h) => (
                        <th key={h} className="border border-gray-200 px-2 py-1.5 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {GRADE_TABLE.map((r) => (
                      <tr key={r[0]}>
                        {r.map((c, i) => (
                          <td key={i} className={`border border-gray-200 px-2 py-1.5 ${c === "해당없음" ? "text-center text-gray-400" : ""}`}>{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
          <div className="min-w-0 space-y-2">
            <p className="flex items-center gap-1 text-xs font-semibold text-gray-700">
              결재선
              <HelpTip text="작성 → 검토(팀장) → 검토(EHS팀장) → 승인(부문장) 순으로 결재합니다. 환경설정 → 양식별 결재선에서 바꿀 수 있습니다." />
              <span className="font-normal text-gray-500">· 칸을 누르면 바꿀 수 있습니다</span>
            </p>
            <ApprovalLineEditor
              meId={meId}
              value={line}
              onChange={(v) => {
                setLine(v);
                setLineEdited(true);
              }}
              people={people}
              noExec
              noButton
            />
          </div>
        </div>
      </Panel>

      {/* 01 */}
      <Panel num="01" title="작업 개요">
        <F label="용도">
          <div className="flex flex-wrap gap-2">
            {PURPOSES.map((p) => (
              <Pill key={p} checked={f.purposes.includes(p)} onChange={(v) => set({ purposes: toggle(f.purposes, p, v) })}>
                {p}
              </Pill>
            ))}
          </div>
        </F>
        <div className="grid gap-3 md:grid-cols-2">
          <F label="준비물">
            <input className={INPUT} value={f.supplies} onChange={(e) => set({ supplies: e.target.value })} placeholder="예) 출입금지 펜스, 고임목, 무전기" />
          </F>
          <F label="개인 보호구">
            <input className={INPUT} value={f.ppe} onChange={(e) => set({ ppe: e.target.value })} placeholder="예) 안전모, 보안면, 내화학장갑, 내화학복, 내화학장화" />
          </F>
        </div>
        <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <F label="취급물질의 주요물성 및 유해 위험성">
            <textarea
              className={TA}
              value={f.materials}
              onChange={(e) => set({ materials: e.target.value })}
              placeholder={"1. 물질명 : 과산화수소 54%\n2. 물리적 성질 : 무색투명, 쏘는냄새\n3. pH : < 3.0\n4. 건강위험성 : …\n5. 물리위험성 : …"}
            />
          </F>
          <F label="비상 연락처">
            <textarea className={TA} value={f.contacts} onChange={(e) => set({ contacts: e.target.value })} />
          </F>
        </div>
      </Panel>

      {/* 02 */}
      <Panel num="02" title="유해위험 요인 Check · 이상발생시 조치요령">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-2">
            {HAZARD_COLS.flat().map((h) => (
              <Pill key={h} checked={f.hazards.includes(h)} onChange={(v) => set({ hazards: toggle(f.hazards, h, v) })}>
                {h}
              </Pill>
            ))}
          </div>
          <F label="이상발생시 조치요령">
            <textarea className={`${TA} min-h-[180px]`} value={f.emergency} onChange={(e) => set({ emergency: e.target.value })} />
          </F>
        </div>
      </Panel>

      {/* 03 */}
      <Panel num="03" title="작업 단계" sub="단계마다 사진 · 유해위험 요인 · 작업 내용 · 안전 대책 · 안전설비 및 작업관리기준">
        <Hint>작업 내용에 ①②③ 번호를 적고, 사진에도 같은 위치를 표시해 두면 현장에서 보기 쉽습니다. 사진은 단계마다 {MAX_PHOTOS}장까지 올릴 수 있습니다.</Hint>
        <div className="space-y-3">
          {f.steps.map((s, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-800 text-sm font-bold text-white">{i + 1}</span>
                <input className={`${INPUT} min-w-0 flex-1`} value={s.name} onChange={(e) => setStep(i, { name: e.target.value })} placeholder="작업 단계 (예: 작업 준비 및 차량 주차)" />
                <span className="flex gap-1">
                  <Mini onClick={() => moveStep(i, -1)} disabled={i === 0} label="위로">↑</Mini>
                  <Mini onClick={() => moveStep(i, 1)} disabled={i === f.steps.length - 1} label="아래로">↓</Mini>
                  <Mini
                    onClick={() => {
                      if ((s.name || s.work || s.photos.length) && !confirm(`${i + 1}단계를 지울까요?`)) return;
                      set({ steps: f.steps.filter((_, j) => j !== i) });
                    }}
                    label="삭제"
                  >
                    ✕
                  </Mini>
                </span>
              </div>
              <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-600">사진</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {s.photos.map((p) => (
                      <div key={p} className="relative aspect-[4/3] overflow-hidden rounded border border-gray-200 bg-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {urls[p] && <img src={urls[p]} alt="" className="h-full w-full object-cover" />}
                        <button
                          type="button"
                          aria-label="사진 빼기"
                          onClick={() => setStep(i, { photos: s.photos.filter((x) => x !== p) })}
                          className="absolute top-0.5 right-0.5 h-6 w-6 rounded-full bg-black/60 text-xs text-white"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {s.photos.length < MAX_PHOTOS && (
                      <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-gray-300 text-xs text-gray-500 hover:border-brand-500 hover:text-brand-700">
                        <span className="text-xl">📷</span>
                        사진 추가
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onClick={() => preloadHeic()}
                          onChange={(e) => {
                            addPhotos(i, e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <F label="작업 내용">
                    <textarea className={`${TA} min-h-[140px]`} value={s.work} onChange={(e) => setStep(i, { work: e.target.value })} placeholder={"1. 안전보호구를 착용한다.\n2. …"} />
                  </F>
                  <F label="유해위험 요인">
                    <textarea className={`${TA} min-h-[140px]`} value={s.hazard} onChange={(e) => setStep(i, { hazard: e.target.value })} placeholder={"1. 과속으로 인한 충돌 위험\n2. …"} />
                  </F>
                  <F label="안전 대책">
                    <textarea className={TA} value={s.safety} onChange={(e) => setStep(i, { safety: e.target.value })} placeholder={"1. 2인1조 작업\n2. 안전보호구 착용"} />
                  </F>
                  <F label="안전설비 및 작업관리기준">
                    <textarea className={TA} value={s.standard} onChange={(e) => setStep(i, { standard: e.target.value })} placeholder="예) KC 인증된 안전보호구 착용" />
                  </F>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => set({ steps: [...f.steps, emptyStep()] })} className="text-sm font-medium text-brand-700 hover:underline">
            + 작업 단계 추가
          </button>
        </div>
      </Panel>

      {/* 04 */}
      <Panel num="04" title="제개정 이력">
        <Sub title="Rev. 별 변경 내용 (작성·검토·승인은 결재가 끝나면 자동으로 들어갑니다)">
          <div className="space-y-2">
            {f.history.map((h, i) => (
              <div key={i} className="grid grid-cols-[60px_minmax(0,1fr)_28px] items-center gap-2 sm:grid-cols-[70px_minmax(0,1fr)_150px_28px]">
                <input
                  className={`${INPUT} text-center`}
                  type="number"
                  value={h.rev}
                  onChange={(e) => set({ history: f.history.map((x, j) => (j === i ? { ...x, rev: Number(e.target.value) || 0 } : x)) })}
                  aria-label="Rev."
                />
                <input className={INPUT} value={h.content} onChange={(e) => set({ history: f.history.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)) })} placeholder="변경 내용 (예: 제정, 원료하역 Box 변경)" />
                <input
                  className={`${INPUT} col-span-2 sm:col-span-1`}
                  type="date"
                  value={h.date}
                  onChange={(e) => set({ history: f.history.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })}
                  aria-label="일자"
                />
                <button type="button" aria-label="삭제" onClick={() => set({ history: f.history.filter((_, j) => j !== i) })} className="text-gray-400 hover:text-red-600">
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => set({ history: [...f.history, { rev, content: "", date: new Date().toISOString().slice(0, 10) }] })}
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              + 이력 추가
            </button>
          </div>
        </Sub>
      </Panel>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur left-[var(--sidebar-w)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            {uploading > 0 ? <p className="text-sm text-brand-700">사진 올리는 중… ({uploading}장)</p> : <FormMessage state={state} />}
          </div>
          <Button variant="secondary" disabled={pending || uploading > 0} onClick={save}>{pending ? "저장 중…" : "💾 임시 저장"}</Button>
          <Button disabled={pending || uploading > 0} onClick={submit}>{pending ? "처리 중…" : "결재 상신"}</Button>
        </div>
      </div>
    </div>
  );
}

function Mini({ children, onClick, disabled, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className="h-8 w-8 rounded border border-gray-300 bg-white text-xs hover:bg-gray-100 disabled:opacity-30">
      {children}
    </button>
  );
}
