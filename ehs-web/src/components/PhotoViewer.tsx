"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rotatePhoto } from "@/app/(main)/findings/actions";

export type ViewerPhoto = { kind: "before" | "after"; path: string; url: string };

// 사진을 돌린 이미지로 다시 만듦 (원본 1600px · 썸네일 360px, 앱의 사진 저장 규칙과 같음)
async function rotated(url: string, quarter: number): Promise<{ main: Blob; thumb: Blob }> {
  const bmp = await createImageBitmap(await (await fetch(url, { cache: "no-store" })).blob());
  const make = (long: number, quality: number) =>
    new Promise<Blob>((resolve, reject) => {
      const s = Math.min(1, long / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * s);
      const h = Math.round(bmp.height * s);
      const side = quarter % 2 === 1;
      const c = document.createElement("canvas");
      c.width = side ? h : w;
      c.height = side ? w : h;
      const ctx = c.getContext("2d")!;
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate((quarter * Math.PI) / 2);
      ctx.drawImage(bmp, -w / 2, -h / 2, w, h);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("사진 변환 실패"))), "image/jpeg", quality);
    });
  const out = { main: await make(1600, 0.85), thumb: await make(360, 0.75) };
  bmp.close();
  return out;
}

// 사진 확대 보기 : 개선 전 / 개선 후, 권한이 있으면 90° 회전 후 저장
export function PhotoViewer({ findingId, photos, startIndex = 0, canEdit, title, onClose }: {
  findingId: string;
  photos: ViewerPhoto[];
  startIndex?: number;
  canEdit: boolean;
  title?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [i, setI] = useState(startIndex);
  const [turn, setTurn] = useState(0); // 화면에서 돌린 횟수 (90° 단위)
  const [msg, setMsg] = useState("");
  const [bust, setBust] = useState<Record<string, number>>({}); // 저장 후 새로 불러오기
  const [pending, start] = useTransition();
  const p = photos[i];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function go(d: number) {
    if (photos.length < 2) return;
    setI((x) => (x + d + photos.length) % photos.length);
    setTurn(0);
    setMsg("");
  }

  const save = () =>
    start(async () => {
      setMsg("");
      try {
        const q = ((turn % 4) + 4) % 4;
        const { main, thumb } = await rotated(p.url, q);
        const fd = new FormData();
        fd.set("finding_id", findingId);
        fd.set("path", p.path);
        fd.set("main", main, "main.jpg");
        fd.set("thumb", thumb, "thumb.jpg");
        const res = await rotatePhoto(fd);
        if (res?.error) return setMsg(res.error);
        setBust((b) => ({ ...b, [p.path]: Date.now() }));
        setTurn(0);
        setMsg("회전해 저장했습니다.");
        router.refresh();
      } catch (e) {
        setMsg((e as Error).message);
      }
    });

  if (!p) return null;
  const src = bust[p.path] ? `${p.url}&v=${bust[p.path]}` : p.url;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/85" onClick={onClose}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            <span className={`mr-2 rounded px-1.5 py-0.5 text-xs ${p.kind === "before" ? "bg-amber-500" : "bg-emerald-600"}`}>{p.kind === "before" ? "개선 전" : "개선 후"}</span>
            {title}
          </p>
          {photos.length > 1 && <p className="text-xs text-gray-300">{i + 1} / {photos.length} (← → 키로 넘기기)</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canEdit && (
            <>
              <button onClick={() => setTurn((t) => t - 1)} className="rounded bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25" title="왼쪽으로 90° 회전">
                ↺
              </button>
              <button onClick={() => setTurn((t) => t + 1)} className="rounded bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25" title="오른쪽으로 90° 회전">
                ↻
              </button>
              <button
                onClick={save}
                disabled={pending || ((turn % 4) + 4) % 4 === 0}
                className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium hover:bg-brand-700 disabled:opacity-40"
              >
                {pending ? "저장 중…" : "회전 저장"}
              </button>
            </>
          )}
          <button onClick={onClose} className="ml-2 rounded px-2 py-1 text-lg hover:bg-white/15" aria-label="닫기">
            ✕
          </button>
        </div>
      </div>
      {msg && <p className="mx-auto mb-2 rounded bg-white/90 px-3 py-1 text-sm text-gray-800" onClick={(e) => e.stopPropagation()}>{msg}</p>}
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        {photos.length > 1 && (
          <button onClick={(e) => (e.stopPropagation(), go(-1))} className="absolute left-2 rounded-full bg-white/15 px-3 py-2 text-2xl text-white hover:bg-white/30" aria-label="이전">
            ‹
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={p.kind === "before" ? "개선 전" : "개선 후"}
          onClick={(e) => e.stopPropagation()}
          style={{ transform: `rotate(${turn * 90}deg)` }}
          className={`object-contain transition-transform ${turn % 2 ? "max-h-[85vw] max-w-[80vh]" : "max-h-full max-w-full"}`}
        />
        {photos.length > 1 && (
          <button onClick={(e) => (e.stopPropagation(), go(1))} className="absolute right-2 rounded-full bg-white/15 px-3 py-2 text-2xl text-white hover:bg-white/30" aria-label="다음">
            ›
          </button>
        )}
      </div>
    </div>
  );
}
