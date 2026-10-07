"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LineStep, StepKind } from "@/lib/approval-line";
import type { Person } from "@/lib/approval";

// 결재라인 (사내 그룹웨어 품의서 방식)
//   화면 : 결재 / 합의 표 + 수신및참조 · 시행자 → 누르면 "결재라인 지정" 창
//   창   : 왼쪽 조직도(사업장 › 부문 › 부서 › 파트) · 검색 → 사람 고르고 [결재] [합의] [수신참조] [시행] → 순서 정리 → 저장
//   저장 형식은 기존과 같음 (LineStep[]). 결재 = 담당/검토/승인, 합의 = 협조, 수신참조 = 참조, 시행 = 시행

type Kind = "결재" | "합의" | "참조" | "시행";
const kindOf = (s: LineStep): Kind => (s.step_kind === "협조" ? "합의" : s.step_kind === "참조" ? "참조" : s.step_kind === "시행" ? "시행" : "결재");
const stepKindFor = (k: Kind): StepKind => (k === "합의" ? "협조" : k === "참조" ? "참조" : k === "시행" ? "시행" : "검토");

type Dept = { id: string; name: string; division: string | null; parent_id: string | null; site_id: string; sort_order: number };
type Site = { id: string; name: string };

export function ApprovalLineEditor({ value, onChange, people, meId }: { value: LineStep[]; onChange: (v: LineStep[]) => void; people: Person[]; meId?: string }) {
  const [open, setOpen] = useState(false);
  const who = (id: string | null) => people.find((p) => p.id === id);
  const line = value.filter((s) => kindOf(s) === "결재" || kindOf(s) === "합의");
  const cc = value.filter((s) => kindOf(s) === "참조");
  const exec = value.filter((s) => kindOf(s) === "시행");
  const missing = line.filter((s) => s.required && !s.approver_id);
  const order = (s: LineStep) => line.indexOf(s) + 1;

  const row = (kind: "결재" | "합의") => {
    const items = line.filter((s) => kindOf(s) === kind);
    const cols = Math.max(4, items.length);
    return (
      <tr key={kind}>
        <th className="w-9 border border-gray-400 bg-gray-50 px-0.5 text-center align-middle text-[11px] font-medium text-gray-700 sm:w-12 sm:text-xs">{kind}</th>
        {Array.from({ length: cols }, (_, i) => {
          const s = items[i];
          const p = s ? who(s.approver_id) : undefined;
          return (
            <td key={i} className="w-14 border border-gray-400 p-0 align-top text-center text-[11px] sm:w-24 sm:text-xs">
              {/* 위 칸 : 직위(없으면 단계 이름) — 길면 두 줄까지, 칸 높이 고정 */}
              <div className="flex h-10 items-center justify-center border-b border-gray-300 px-1 leading-tight font-medium break-keep text-gray-700">
                <span className="line-clamp-2">{s ? (p?.position ?? s.label) : ""}</span>
              </div>
              {/* 아래 칸 : 순번 → 이름 (위아래로 떨어뜨려 겹치지 않게) */}
              <div className="flex h-14 flex-col items-center justify-center gap-1 px-1">
                {s && <span className="inline-block min-w-5 border border-gray-400 px-1 text-[10px] leading-4 text-gray-600">{order(s)}</span>}
                <p className={`w-full truncate leading-4 ${s && !p ? "text-red-600" : "text-gray-900"}`}>{s ? (p?.name ?? "미지정") : ""}</p>
              </div>
            </td>
          );
        })}
      </tr>
    );
  };

  const chips = (list: LineStep[]) =>
    list.length ? (
      <span className="flex flex-wrap gap-1">
        {list.map((s) => {
          const p = who(s.approver_id);
          return (
            <span key={s.approver_id} className="rounded bg-brand-50 px-2 py-0.5 text-xs text-brand-900 ring-1 ring-brand-200">
              {p ? `${p.name}${p.position ? ` ${p.position}` : ""}` : "?"}
            </span>
          );
        })}
      </span>
    ) : (
      <span className="text-xs text-gray-400">없음</span>
    );

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left" title="눌러서 결재라인 지정">
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <tbody>
              {row("결재")}
              {row("합의")}
            </tbody>
          </table>
        </div>
      </button>
      <table className="w-full border-collapse text-sm">
        <tbody>
          <tr>
            <th className="w-24 border border-gray-300 bg-gray-50 px-2 py-1.5 text-xs font-medium text-gray-700">수신및참조</th>
            <td className="border border-gray-300 px-2 py-1.5">{chips(cc)}</td>
          </tr>
          <tr>
            <th className="w-24 border border-gray-300 bg-gray-50 px-2 py-1.5 text-xs font-medium text-gray-700">시행자</th>
            <td className="border border-gray-300 px-2 py-1.5">{chips(exec)}</td>
          </tr>
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-brand-700 bg-white px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-50">
          결재라인 지정
        </button>
        {missing.length > 0 && <span className="text-xs text-red-600">결재자를 지정해 주세요 : {missing.map((s) => s.label).join(", ")}</span>}
      </div>
      {open && <LineDialog value={value} people={people} meId={meId} onClose={() => setOpen(false)} onSave={(v) => (onChange(v), setOpen(false))} />}
    </div>
  );
}

// ---------------------------------------------------------------- 결재라인 지정 창
function LineDialog({ value, people, meId, onClose, onSave }: { value: LineStep[]; people: Person[]; meId?: string; onClose: () => void; onSave: (v: LineStep[]) => void }) {
  const [items, setItems] = useState<LineStep[]>(value);
  const [tab, setTab] = useState<"결재" | "참조" | "시행">("결재");
  const [org, setOrg] = useState<{ sites: Site[]; depts: Dept[] } | null>(null);
  const [deptSel, setDeptSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [checked, setChecked] = useState<string[]>([]);
  const [marked, setMarked] = useState<number[]>([]);
  const [drag, setDrag] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    const sb = createClient();
    Promise.all([
      sb.from("sites").select("id, name").eq("is_active", true).order("sort_order"),
      sb.from("departments").select("id, name, division, parent_id, site_id, sort_order").eq("is_active", true).order("sort_order"),
    ]).then(([s, d]) => alive && setOrg({ sites: (s.data ?? []) as Site[], depts: (d.data ?? []) as Dept[] }));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const deptOf = (id: string | null) => org?.depts.find((d) => d.id === id);
  const siteName = (p: Person) => org?.sites.find((s) => s.id === deptOf(p.department_id)?.site_id)?.name ?? "";
  const deptLabel = (p: Person) => {
    const d = deptOf(p.department_id);
    if (!d) return p.department ?? "";
    const parent = d.parent_id ? deptOf(d.parent_id) : null;
    return parent ? `${parent.name} › ${d.name}` : d.name;
  };

  // 오른쪽 위 목록 : 검색어가 있으면 이름·부서·직위 검색, 없으면 고른 부서(+그 파트) 사람
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (k) return people.filter((p) => [p.name, p.position, p.department].some((v) => v?.toLowerCase().includes(k)));
    if (!deptSel) return [];
    const ids = new Set([deptSel, ...(org?.depts.filter((d) => d.parent_id === deptSel).map((d) => d.id) ?? [])]);
    return people.filter((p) => p.department_id && ids.has(p.department_id));
  }, [q, deptSel, people, org]);

  const add = (kind: Kind) => {
    const pick = people.filter((p) => checked.includes(p.id));
    if (pick.length === 0) return setMsg("위 목록에서 사람을 먼저 체크하세요.");
    const exists = (id: string, k: Kind) => items.some((s) => s.approver_id === id && kindOf(s) === k);
    const add = pick
      .filter((p) => !exists(p.id, kind))
      .map((p): LineStep => ({ step_kind: stepKindFor(kind), label: p.position ?? kind, approver_id: p.id, required: true }));
    setItems([...items, ...add]);
    setChecked([]);
    setMsg(add.length < pick.length ? "이미 들어 있는 사람은 빼고 추가했습니다." : "");
    setTab(kind === "합의" ? "결재" : (kind as "결재" | "참조" | "시행"));
  };

  const tabItems = items.map((s, i) => ({ s, i })).filter(({ s }) => (tab === "결재" ? kindOf(s) === "결재" || kindOf(s) === "합의" : kindOf(s) === tab));
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    const next = [...items];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setItems(next);
    setMarked([]);
  };
  const remove = () => {
    setItems(items.filter((_, i) => !marked.includes(i)));
    setMarked([]);
  };
  const save = () => {
    const missing = items.filter((s) => (kindOf(s) === "결재" || kindOf(s) === "합의") && s.required && !s.approver_id);
    if (missing.length) return setMsg(`결재자가 비어 있는 칸이 있습니다 : ${missing.map((s) => s.label).join(", ")} — 사람을 넣거나 삭제하세요.`);
    if (!items.some((s) => (kindOf(s) === "결재" || kindOf(s) === "합의") && s.approver_id && s.approver_id !== meId)) return setMsg("본인 외 결재자를 1명 이상 지정해 주세요.");
    onSave(items.filter((s) => s.approver_id || s.required));
  };

  // 조직도
  const tree = useMemo(() => {
    if (!org) return [];
    return org.sites.map((site) => {
      const teams = org.depts.filter((d) => d.site_id === site.id && !d.parent_id);
      const divisions = [...new Set(teams.map((d) => d.division ?? ""))];
      return {
        site,
        divisions: divisions.map((div) => ({
          name: div || "기타",
          teams: teams.filter((t) => (t.division ?? "") === div).map((t) => ({ team: t, parts: org.depts.filter((p) => p.parent_id === t.id) })),
        })),
      };
    });
  }, [org]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="flex max-h-[95vh] w-full flex-col rounded-t-xl bg-white shadow-xl sm:max-w-5xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-lg font-semibold text-gray-900">결재라인 지정</h3>
          <button onClick={onClose} className="rounded p-1 text-xl text-gray-500 hover:bg-gray-100" aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4 md:grid md:grid-cols-[280px_1fr]">
          {/* 왼쪽 : 검색 + 조직도 */}
          <div className="flex shrink-0 flex-col gap-2 md:min-h-0">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="이름 · 부서 · 직위 검색"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-700 focus:outline-none"
            />
            <div className="h-52 overflow-y-auto rounded-md border border-gray-200 p-2 text-sm md:h-auto md:max-h-none md:flex-1">
              {!org && <p className="p-2 text-xs text-gray-500">조직도를 불러오는 중…</p>}
              {tree.map(({ site, divisions }) => (
                <details key={site.id} open className="mb-1">
                  <summary className="cursor-pointer py-1 font-medium text-gray-900">🏢 {site.name}</summary>
                  {divisions.map((div) => (
                    <details key={div.name} open={div.teams.some((t) => t.team.id === deptSel || t.parts.some((p) => p.id === deptSel))} className="ml-3">
                      <summary className="cursor-pointer py-0.5 text-gray-800">📁 {div.name}</summary>
                      {div.teams.map(({ team, parts }) => (
                        <div key={team.id} className="ml-4">
                          <DeptButton name={team.name} active={deptSel === team.id} onClick={() => (setDeptSel(team.id), setQ(""))} />
                          {parts.map((p) => (
                            <div key={p.id} className="ml-4">
                              <DeptButton name={p.name} active={deptSel === p.id} onClick={() => (setDeptSel(p.id), setQ(""))} />
                            </div>
                          ))}
                        </div>
                      ))}
                    </details>
                  ))}
                </details>
              ))}
            </div>
          </div>

          {/* 오른쪽 */}
          <div className="flex min-w-0 shrink-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-gray-600">
                {q ? `검색 결과 ${list.length}명` : deptSel ? `${deptOf(deptSel)?.name ?? ""} ${list.length}명` : "조직도에서 부서를 고르거나 이름을 검색하세요"}
              </p>
              <div className="flex gap-1">
                {(["결재", "합의", "참조", "시행"] as Kind[]).map((k) => (
                  <button key={k} type="button" onClick={() => add(k)} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:border-brand-700 hover:text-brand-800">
                    {k === "참조" ? "수신참조" : k}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border border-gray-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-xs text-gray-600">
                  <tr>
                    <th className="w-8 px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={list.length > 0 && list.every((p) => checked.includes(p.id))}
                        onChange={(e) => setChecked(e.target.checked ? list.map((p) => p.id) : [])}
                        aria-label="모두 선택"
                      />
                    </th>
                    <th className="hidden px-2 py-1.5 text-left sm:table-cell">사업장</th>
                    <th className="px-2 py-1.5 text-left">부서</th>
                    <th className="px-2 py-1.5 text-left">직위</th>
                    <th className="px-2 py-1.5 text-left">사용자</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {list.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setChecked((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))}
                      className={`cursor-pointer hover:bg-brand-50 ${checked.includes(p.id) ? "bg-brand-50" : ""}`}
                    >
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" readOnly checked={checked.includes(p.id)} />
                      </td>
                      <td className="hidden px-2 py-1.5 text-xs text-gray-600 sm:table-cell">{siteName(p)}</td>
                      <td className="px-2 py-1.5 text-xs text-gray-600">{deptLabel(p)}</td>
                      <td className="px-2 py-1.5 text-xs text-gray-600">{p.position ?? ""}</td>
                      <td className="px-2 py-1.5 font-medium text-gray-900">{p.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 아래 : 결재 / 수신참조 / 시행 */}
            <div className="flex items-end justify-between border-b border-gray-200">
              <div className="flex">
                {(
                  [
                    ["결재", "결재"],
                    ["참조", "수신참조"],
                    ["시행", "시행"],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => (setTab(k), setMarked([]))}
                    className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === k ? "border-brand-800 font-semibold text-brand-800" : "border-transparent text-gray-600"}`}
                  >
                    {l}
                    <span className="ml-1 text-xs text-gray-400">{items.filter((s) => (k === "결재" ? kindOf(s) === "결재" || kindOf(s) === "합의" : kindOf(s) === k)).length}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={remove} disabled={marked.length === 0} className="mb-1 rounded-md border border-gray-300 px-3 py-1 text-sm disabled:opacity-40">
                삭제
              </button>
            </div>
            <div className="overflow-x-auto rounded-md border border-gray-200">
              <table className="w-full text-sm sm:min-w-[520px]">
                <thead className="bg-gray-50 text-xs text-gray-600">
                  <tr>
                    <th className="w-8 px-2 py-1.5" />
                    <th className="w-14 px-1 py-1.5">이동</th>
                    <th className="w-10 px-2 py-1.5">NO</th>
                    {tab === "결재" && <th className="w-16 px-2 py-1.5">종류</th>}
                    <th className="hidden px-2 py-1.5 text-left sm:table-cell">사업장</th>
                    <th className="hidden px-2 py-1.5 text-left sm:table-cell">부서</th>
                    <th className="px-2 py-1.5 text-left">사용자</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tabItems.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-xs text-gray-500">
                        위에서 사람을 체크하고 [{tab === "참조" ? "수신참조" : tab === "시행" ? "시행" : "결재 / 합의"}] 를 누르세요
                      </td>
                    </tr>
                  )}
                  {tabItems.map(({ s, i }, n) => {
                    const p = people.find((x) => x.id === s.approver_id);
                    return (
                      <tr
                        key={`${i}-${s.approver_id}`}
                        draggable
                        onDragStart={() => setDrag(i)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => drag !== null && (move(drag, i), setDrag(null))}
                        className={`${drag === i ? "opacity-40" : ""} ${marked.includes(i) ? "bg-red-50" : "bg-white"}`}
                      >
                        <td className="px-2 py-1.5 text-center">
                          <input type="checkbox" checked={marked.includes(i)} onChange={() => setMarked((m) => (m.includes(i) ? m.filter((x) => x !== i) : [...m, i]))} aria-label="삭제할 줄 선택" />
                        </td>
                        <td className="px-1 py-1.5 text-center whitespace-nowrap">
                          <span className="hidden cursor-grab px-1 text-gray-400 sm:inline" title="끌어서 순서 바꾸기">
                            ☰
                          </span>
                          <button type="button" onClick={() => move(i, tabItems[n - 1]?.i ?? i)} disabled={n === 0} className="px-1 text-gray-500 disabled:opacity-20" aria-label="위로">
                            ↑
                          </button>
                          <button type="button" onClick={() => move(i, tabItems[n + 1]?.i ?? i)} disabled={n === tabItems.length - 1} className="px-1 text-gray-500 disabled:opacity-20" aria-label="아래로">
                            ↓
                          </button>
                        </td>
                        <td className="px-2 py-1.5 text-center">{n + 1}</td>
                        {tab === "결재" && (
                          <td className="px-2 py-1.5 text-center">
                            <select
                              value={kindOf(s)}
                              onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, step_kind: stepKindFor(e.target.value as Kind) } : x)))}
                              className="rounded border border-gray-300 px-1 py-0.5 text-xs"
                              aria-label="종류"
                            >
                              <option>결재</option>
                              <option>합의</option>
                            </select>
                          </td>
                        )}
                        <td className="hidden px-2 py-1.5 text-xs text-gray-600 sm:table-cell">{p ? siteName(p) : ""}</td>
                        <td className="hidden px-2 py-1.5 text-xs text-gray-600 sm:table-cell">{p ? deptLabel(p) : ""}</td>
                        <td className="px-2 py-1.5">
                          {p ? (
                            <>
                              <b className="font-medium text-gray-900">{p.name}</b> <span className="text-xs text-gray-500">{p.position ?? ""}</span>
                              <span className="block text-[11px] text-gray-500 sm:hidden">{deptLabel(p)}</span>
                            </>
                          ) : (
                            <span className="text-xs text-red-600">{s.label} — 미지정</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {msg && <p className="text-sm text-amber-700">{msg}</p>}
          </div>
        </div>

        <div className="flex justify-center gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white px-5 py-2 text-sm">
            취소
          </button>
          <button type="button" onClick={save} className="rounded-md bg-brand-700 px-8 py-2 text-sm font-semibold text-white hover:bg-brand-800">
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

function DeptButton({ name, active, onClick }: { name: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`block w-full truncate rounded px-1.5 py-0.5 text-left ${active ? "bg-brand-100 font-medium text-brand-900" : "text-gray-700 hover:bg-gray-100"}`}>
      📁 {name}
    </button>
  );
}

// 상신 형식으로 정리 : 결재 = 첫 줄이 작성자 본인이면 담당, 마지막 결재 = 승인, 나머지 = 검토 · 합의 = 협조 · 수신참조/시행 그대로
export function finalizeLine(line: LineStep[], drafterId?: string): { steps?: { step_kind: StepKind; label: string; approver_id: string }[]; error?: string } {
  const missing = line.find((s) => s.required && !s.approver_id && kindOf(s) !== "참조" && kindOf(s) !== "시행");
  if (missing) return { error: `'${missing.label}' 결재자를 지정해 주세요.` };
  const filled = line.filter((s) => s.approver_id);
  const approvals = filled.filter((s) => kindOf(s) === "결재");
  const lastApproval = approvals.at(-1);
  const steps = filled.map((s, i) => {
    const k = kindOf(s);
    let step_kind: StepKind = s.step_kind;
    if (k === "결재") step_kind = i === 0 && drafterId && s.approver_id === drafterId ? "담당" : s === lastApproval ? "승인" : s.step_kind === "담당" ? "검토" : s.step_kind === "확인" ? "확인" : "검토";
    if (k === "결재" && s === lastApproval && step_kind === "담당") step_kind = "담당";
    return { step_kind, label: s.label.trim() || k, approver_id: s.approver_id! };
  });
  if (!steps.some((s) => s.step_kind !== "참조" && s.step_kind !== "시행")) return { error: "결재선을 지정해 주세요." };
  return { steps };
}
