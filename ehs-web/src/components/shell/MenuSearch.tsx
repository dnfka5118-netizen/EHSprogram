"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Domain } from "@/lib/menu";

type Entry = { label: string; href?: string; path: string };

// 메뉴 검색 (Ctrl+K) — 분야·묶음 이름으로도 찾을 수 있다
export function MenuSearch({ domains, open, onClose }: { domains: Domain[]; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const all = useMemo<Entry[]>(
    () =>
      domains.flatMap((d) =>
        d.sections.flatMap((s) => s.items.map((i) => ({ label: i.label, href: i.href, path: d.key === "common" ? "공통" : `${d.label} › ${s.label}` }))),
      ),
    [domains],
  );
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = all
    .filter((e) => words.every((w) => `${e.label} ${e.path}`.toLowerCase().includes(w)))
    .sort((a, b) => Number(!!b.href) - Number(!!a.href))
    .slice(0, 30);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;
  const go = (e?: Entry) => {
    if (!e?.href) return;
    onClose();
    setQ("");
    router.push(e.href);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-20" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") setCursor((c) => Math.min(c + 1, list.length - 1));
            if (e.key === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
            if (e.key === "Enter") go(list[cursor]);
          }}
          placeholder="메뉴 이름으로 찾기 (예: 허가, 점검, 폐기물)"
          className="w-full border-b border-gray-200 px-4 py-3 text-base focus:outline-none"
        />
        <ul className="max-h-[60vh] overflow-y-auto py-1">
          {list.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-500">찾는 메뉴가 없습니다.</li>}
          {list.map((e, i) => (
            <li key={`${e.path}-${e.label}`}>
              <button
                type="button"
                disabled={!e.href}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(e)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${i === cursor && e.href ? "bg-brand-50" : ""} disabled:cursor-default`}
              >
                <span className={e.href ? "font-medium text-gray-900" : "text-gray-400"}>{e.label}</span>
                <span className="shrink-0 text-xs text-gray-400">
                  {e.path}
                  {!e.href && " · 준비 중"}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">↑↓ 이동 · Enter 열기 · Esc 닫기</p>
      </div>
    </div>
  );
}
