"use client";

import { useEffect, useRef } from "react";

// 터치/마우스 서명 → PNG data URL (원본 양식과 같은 선 굵기·색)
export function SignaturePad({ value, onChange, label, width = 216, height = 78, disabled }: {
  value: string;
  onChange: (dataUrl: string) => void;
  label?: string;
  width?: number;
  height?: number;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // 저장된 서명 다시 그리기
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!value) return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
    img.src = value;
  }, [value]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * e.currentTarget.width) / r.width, y: ((e.clientY - r.top) * e.currentTarget.height) / r.height };
  };

  return (
    <div className="inline-flex flex-col gap-1">
      <canvas
        ref={ref}
        width={width * 2}
        height={height * 2}
        style={{ width, height, touchAction: "none" }}
        className={`rounded-md border-2 bg-white ${value ? "border-solid border-emerald-300" : "border-dashed border-gray-300"} ${disabled ? "opacity-60" : "cursor-crosshair"}`}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          last.current = pos(e);
        }}
        onPointerMove={(e) => {
          if (!drawing.current || !last.current) return;
          const ctx = e.currentTarget.getContext("2d")!;
          const p = pos(e);
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.strokeStyle = "#14203a";
          ctx.beginPath();
          ctx.moveTo(last.current.x, last.current.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          last.current = p;
        }}
        onPointerUp={(e) => {
          if (!drawing.current) return;
          drawing.current = false;
          // 화면은 2배 해상도로 그리고, 저장은 원래 크기로 줄여 용량을 줄인다 (서명 1개 약 3~6KB)
          const out = document.createElement("canvas");
          out.width = width;
          out.height = height;
          out.getContext("2d")!.drawImage(e.currentTarget, 0, 0, width, height);
          onChange(out.toDataURL("image/png"));
        }}
      />
      <span className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-gray-600">{label ?? (value ? "서명됨" : "터치/드래그로 서명")}</span>
        {!disabled && value && (
          <button type="button" onClick={() => onChange("")} className="text-gray-500 hover:text-red-600">
            지우기
          </button>
        )}
      </span>
    </div>
  );
}
