"use client";

import { useRef, useState } from "react";
import { preloadHeic, processPhoto, type ProcessedPhoto } from "@/lib/image";

const MAX_FILES = 6;

// 카메라 촬영 / 앨범 선택 → 즉시 변환·압축 (문제 있는 사진은 여기서 바로 안내)
export function PhotoPicker({ photos, onChange }: { photos: ProcessedPhoto[]; onChange: (photos: ProcessedPhoto[]) => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function add(files: File[]) {
    setError(null);
    const room = MAX_FILES - photos.length;
    const picked = files.slice(0, room);
    if (files.length > room) setError(`사진은 최대 ${MAX_FILES}장까지 등록할 수 있습니다.`);
    setBusy(picked.length);
    const done: ProcessedPhoto[] = [];
    const failed: string[] = [];
    for (const f of picked) {
      try {
        done.push(await processPhoto(f));
      } catch (e) {
        failed.push(e instanceof Error ? e.message : String(e));
      }
      setBusy((b) => b - 1);
    }
    if (done.length) onChange([...photos, ...done]);
    if (failed.length) setError(failed.join("\n"));
  }

  function remove(i: number) {
    URL.revokeObjectURL(photos[i].preview);
    onChange(photos.filter((_, j) => j !== i));
  }

  const full = photos.length >= MAX_FILES;
  const btn =
    "flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-gray-300 text-xs text-gray-600 hover:border-emerald-700 hover:text-emerald-800 disabled:opacity-50";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {photos.map((p, i) => (
          <div key={p.preview} className="relative h-24 w-24 overflow-hidden rounded-md border border-gray-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.preview} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
              aria-label="사진 삭제"
            >
              ✕
            </button>
          </div>
        ))}
        {busy > 0 &&
          Array.from({ length: busy }).map((_, i) => (
            <div key={`busy-${i}`} className="flex h-24 w-24 items-center justify-center rounded-md bg-gray-100 text-xs text-gray-500">
              변환 중…
            </div>
          ))}
        {!full && (
          <>
            <button type="button" className={btn} disabled={busy > 0} onClick={() => cameraRef.current?.click()}>
              <span className="text-2xl leading-none">📷</span>
              카메라 촬영
            </button>
            <button type="button" className={btn} disabled={busy > 0} onClick={() => {
                preloadHeic();
                albumRef.current?.click();
              }}>
              <span className="text-2xl leading-none">🖼️</span>
              앨범 선택
            </button>
          </>
        )}
      </div>
      {/* 카메라 : capture 속성으로 휴대폰 카메라 바로 실행 */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        ref={albumRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      {error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs whitespace-pre-line text-red-700">{error}</p>}
      <p className="mt-1 text-xs text-gray-500">최대 {MAX_FILES}장 · 자동으로 용량을 줄여 저장합니다</p>
    </div>
  );
}
