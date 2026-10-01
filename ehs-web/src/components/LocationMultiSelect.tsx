"use client";

import { useEffect, useRef, useState } from "react";

// 장소 여러 개 선택 (조회 조건) : 고른 장소마다 hidden input name="loc"
export function LocationMultiSelect({ locations, selected }: { locations: { id: string; name: string }[]; selected: string[] }) {
  const [picked, setPicked] = useState<string[]>(selected);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const names = locations.filter((l) => picked.includes(l.id)).map((l) => l.name);
  const label = picked.length === 0 ? "전체 장소" : picked.length <= 2 ? names.join(", ") : `${names[0]} 외 ${picked.length - 1}곳`;

  return (
    <div ref={box} className="relative">
      {picked.map((id) => (
        <input key={id} type="hidden" name="loc" value={id} />
      ))}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-w-40 items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-left"
      >
        <span className={`truncate ${picked.length ? "text-gray-900" : ""}`}>{label}</span>
        <span className="text-xs text-gray-500">▼</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          <div className="flex justify-between border-b border-gray-100 px-3 py-1.5 text-xs">
            <button type="button" onClick={() => setPicked(locations.map((l) => l.id))} className="text-brand-800 hover:underline">
              모두 선택
            </button>
            <button type="button" onClick={() => setPicked([])} className="text-gray-500 hover:underline">
              선택 해제 (전체 장소)
            </button>
          </div>
          {locations.map((l) => (
            <label key={l.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-brand-50">
              <input type="checkbox" checked={picked.includes(l.id)} onChange={() => toggle(l.id)} className="h-4 w-4 accent-brand-800" />
              {l.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
