"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScrollX } from "@/components/ScrollX";
import { SUGGESTION_STATUS, boardDate, kstMonth, type SuggestionRow } from "@/lib/suggestion";

// 게시판 표 : 제목 · 작성자 · 등록일 · 답변상태 — 머리글 ▼ 로 엑셀처럼 값 골라 보기 · 정렬
type Col = "title" | "author" | "date" | "status";
// 휴대폰(md 미만)은 제목 | 답변상태 두 칸 — 작성자·등록일은 제목 아래에
const COLS: { key: Col; label: string; className: string }[] = [
  { key: "title", label: "제목", className: "" },
  { key: "author", label: "작성자", className: "hidden w-32 md:table-cell" },
  { key: "date", label: "등록일", className: "hidden w-44 md:table-cell" },
  { key: "status", label: "답변상태", className: "w-24 md:w-32" },
];
const STATUS_ORDER = Object.keys(SUGGESTION_STATUS);

const valueOf = (r: SuggestionRow, c: Col) =>
  c === "title" ? r.title : c === "author" ? r.author_name : c === "date" ? kstMonth(r.created_at) : SUGGESTION_STATUS[r.status].label;
const sortKey = (r: SuggestionRow, c: Col) =>
  c === "date" ? r.created_at : c === "status" ? String(STATUS_ORDER.indexOf(r.status)) : valueOf(r, c);

type Filters = Partial<Record<Col, Set<string>>>;

export function SuggestionTable({ rows }: { rows: SuggestionRow[] }) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<{ col: Col; dir: 1 | -1 } | null>(null);
  const [menu, setMenu] = useState<{ col: Col; x: number; y: number } | null>(null);

  const pass = (r: SuggestionRow, skip?: Col) => (Object.entries(filters) as [Col, Set<string>][]).every(([c, set]) => c === skip || set.has(valueOf(r, c)));
  const view = useMemo(() => {
    const list = rows.filter((r) => pass(r));
    if (sort) list.sort((a, b) => sortKey(a, sort.col).localeCompare(sortKey(b, sort.col), "ko") * sort.dir);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filters, sort]);
  const active = Object.keys(filters).length > 0;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm text-gray-600">
        <span>
          {active ? `${rows.length}건 중 ${view.length}건` : `총 ${rows.length}건`}
        </span>
        {active && (
          <button type="button" onClick={() => setFilters({})} className="text-xs text-brand-700 underline">
            필터 모두 해제
          </button>
        )}
      </div>
      <ScrollX>
        <table className="w-full border-collapse bg-white text-sm">
          <thead className="bg-brand-50 text-xs text-gray-700">
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={`border border-gray-200 px-2 py-2.5 font-medium whitespace-nowrap ${c.className}`}>
                  <button
                    type="button"
                    onClick={(e) => {
                      const b = e.currentTarget.getBoundingClientRect();
                      setMenu(menu?.col === c.key ? null : { col: c.key, x: Math.min(b.left, window.innerWidth - 272), y: b.bottom + 4 });
                    }}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white ${filters[c.key] ? "bg-white text-brand-800" : ""}`}
                    aria-label={`${c.label} 필터`}
                  >
                    {c.label}
                    <span className={`text-[10px] ${filters[c.key] ? "text-brand-700" : "text-gray-400"}`}>
                      {filters[c.key] ? "▼✓" : sort?.col === c.key ? (sort.dir === 1 ? "▲" : "▼") : "▼"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.length === 0 ? (
              <tr>
                <td colSpan={4} className="border border-gray-200 py-10 text-center text-gray-500">
                  {rows.length === 0 ? "글이 없습니다. 오른쪽 위 [글쓰기]로 의견을 올려 주세요." : "조건에 맞는 글이 없습니다."}
                </td>
              </tr>
            ) : (
              view.map((r) => {
                const st = SUGGESTION_STATUS[r.status];
                const answered = r.done_at ?? r.answered_at;
                return (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onClick={() => router.push(`/suggestions/${r.id}`)}
                    onKeyDown={(e) => e.key === "Enter" && router.push(`/suggestions/${r.id}`)}
                    className="cursor-pointer hover:bg-brand-50/60 focus:bg-brand-50/60 focus:outline-none"
                  >
                    <td className="border border-gray-200 px-3 py-3">
                      <span className="font-semibold break-words text-gray-900">{r.title}</span>
                      {r.comments > 0 && <span className="ml-1.5 text-xs text-gray-500">💬 {r.comments}</span>}
                      {r.photos > 0 && <span className="ml-1.5 text-xs text-gray-500">📎 {r.photos}</span>}
                      <span className="mt-1 block text-xs text-gray-500 md:hidden">
                        {r.author_name} · {boardDate(r.created_at, true)}
                      </span>
                    </td>
                    <td className="hidden border border-gray-200 px-2 py-3 text-center text-gray-700 md:table-cell">{r.author_name}</td>
                    <td className="hidden border border-gray-200 px-2 py-3 text-center whitespace-nowrap text-gray-600 md:table-cell">{boardDate(r.created_at, true)}</td>
                    <td className="border border-gray-200 px-2 py-3 text-center">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${st.style}`}>
                        {r.status === "done" ? "✓ " : ""}
                        {st.label}
                      </span>
                      {answered && <span className="mt-0.5 block text-[11px] text-gray-500">{boardDate(answered, false)}</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </ScrollX>

      {menu && (
        <FilterMenu
          key={menu.col}
          x={menu.x}
          y={menu.y}
          col={menu.col}
          // 다른 열의 필터를 통과한 행의 값만 (엑셀과 같음)
          values={(() => {
            const c = new Map<string, number>();
            for (const r of rows) if (pass(r, menu.col)) c.set(valueOf(r, menu.col), (c.get(valueOf(r, menu.col)) ?? 0) + 1);
            const list = [...c];
            if (menu.col === "status") list.sort((a, b) => STATUS_ORDER.indexOf(statusKey(a[0])) - STATUS_ORDER.indexOf(statusKey(b[0])));
            else if (menu.col === "date") list.sort((a, b) => b[0].localeCompare(a[0]));
            else list.sort((a, b) => a[0].localeCompare(b[0], "ko"));
            return list;
          })()}
          selected={filters[menu.col]}
          onSort={(dir) => {
            setSort({ col: menu.col, dir });
            setMenu(null);
          }}
          onApply={(set) => {
            setFilters((f) => {
              const n = { ...f };
              if (set) n[menu.col] = set;
              else delete n[menu.col];
              return n;
            });
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

const statusKey = (label: string) => STATUS_ORDER.find((k) => SUGGESTION_STATUS[k as SuggestionRow["status"]].label === label) ?? "";

// 엑셀 필터 창 : 정렬 · 검색 · (모두 선택) · 값 체크 → 확인
function FilterMenu({ x, y, col, values, selected, onSort, onApply, onClose }: {
  x: number;
  y: number;
  col: Col;
  values: [string, number][];
  selected?: Set<string>;
  onSort: (dir: 1 | -1) => void;
  onApply: (set: Set<string> | null) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(selected ?? values.map((v) => v[0])));
  const shown = values.filter(([v]) => v.toLowerCase().includes(q.trim().toLowerCase()));
  const allOn = shown.length > 0 && shown.every(([v]) => picked.has(v));

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // 화면이 움직이면 닫음 (필터 창 안의 목록 스크롤은 제외)
    const scroll = (e: Event) => !box.current?.contains(e.target as Node) && onClose();
    const t = setTimeout(() => document.addEventListener("mousedown", close));
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", scroll, { capture: true });
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", scroll, { capture: true });
    };
  }, [onClose]);

  const apply = () => {
    // 검색어가 있으면 검색된 값 중 체크한 것만 (엑셀과 같음)
    const set = new Set([...picked].filter((v) => !q.trim() || shown.some(([s]) => s === v)));
    onApply(set.size === values.length ? null : set);
  };
  const [asc, desc] = col === "date" ? ["오래된 순", "최신 순"] : col === "status" ? ["처리 단계 순", "처리 단계 역순"] : ["오름차순 (가→하)", "내림차순 (하→가)"];

  return (
    <div
      ref={box}
      style={{ left: Math.max(8, x), top: y }}
      className="fixed z-50 w-64 rounded-md border border-gray-300 bg-white p-2 text-sm shadow-lg"
    >
      <button type="button" onClick={() => onSort(1)} className="block w-full rounded px-2 py-1.5 text-left hover:bg-gray-100">
        ↑ {asc}
      </button>
      <button type="button" onClick={() => onSort(-1)} className="block w-full rounded px-2 py-1.5 text-left hover:bg-gray-100">
        ↓ {desc}
      </button>
      <hr className="my-1.5 border-gray-200" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="검색"
        className="mb-1.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
        autoFocus
      />
      <div className="max-h-56 overflow-y-auto rounded border border-gray-200 p-1">
        <label className="flex items-center gap-2 px-1 py-1">
          <input
            type="checkbox"
            checked={allOn}
            onChange={() =>
              setPicked((p) => {
                const n = new Set(p);
                for (const [v] of shown) {
                  if (allOn) n.delete(v);
                  else n.add(v);
                }
                return n;
              })
            }
          />
          <span className="font-medium">(모두 선택)</span>
        </label>
        {shown.map(([v, n]) => (
          <label key={v} className="flex items-start gap-2 px-1 py-1">
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={picked.has(v)}
              onChange={() =>
                setPicked((p) => {
                  const s = new Set(p);
                  if (s.has(v)) s.delete(v);
                  else s.add(v);
                  return s;
                })
              }
            />
            <span className="min-w-0 flex-1 break-words">{v}</span>
            <span className="shrink-0 text-xs text-gray-400">{n}</span>
          </label>
        ))}
        {shown.length === 0 && <p className="px-1 py-2 text-xs text-gray-500">일치하는 값이 없습니다.</p>}
      </div>
      <div className="mt-2 flex justify-end gap-1.5">
        <button type="button" onClick={apply} disabled={picked.size === 0} className="rounded bg-brand-800 px-3 py-1 text-white disabled:opacity-50">
          확인
        </button>
        <button type="button" onClick={onClose} className="rounded border border-gray-300 px-3 py-1">
          취소
        </button>
      </div>
    </div>
  );
}
