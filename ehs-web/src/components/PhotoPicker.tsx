"use client";

import { useEffect, useMemo, useRef } from "react";

const MAX_FILES = 6;

export function PhotoPicker({ files, onChange, label = "사진 추가" }: { files: File[]; onChange: (files: File[]) => void; label?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {previews.map((src, i) => (
          <div key={src} className="relative h-24 w-24 overflow-hidden rounded-md border border-gray-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
              aria-label="사진 삭제"
            >
              ✕
            </button>
          </div>
        ))}
        {files.length < MAX_FILES && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-24 w-24 flex-col items-center justify-center rounded-md border-2 border-dashed border-gray-300 text-xs text-gray-500 hover:border-emerald-700 hover:text-emerald-800"
          >
            <span className="text-2xl leading-none">＋</span>
            {label}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          onChange([...files, ...picked].slice(0, MAX_FILES));
          e.target.value = "";
        }}
      />
      <p className="mt-1 text-xs text-gray-500">최대 {MAX_FILES}장 · 업로드 시 자동으로 용량을 줄입니다</p>
    </div>
  );
}
