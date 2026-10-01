"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// 넓은 표 : 표 위쪽에도 가로 스크롤 바를 둔다 (화면 확대 110~120% 에서 맨 아래까지 내리지 않고 좌우로 이동)
export function ScrollX({ children, className = "" }: { children: ReactNode; className?: string }) {
  const top = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.scrollWidth);
      setOverflow(el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);

  const sync = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (from && to && to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
  };

  return (
    <div className={className}>
      <div
        ref={top}
        onScroll={() => sync(top.current, body.current)}
        className={`sticky top-16 z-10 overflow-x-auto overflow-y-hidden bg-white ${overflow ? "h-4" : "hidden"}`}
        aria-hidden
      >
        <div style={{ width, height: 1 }} />
      </div>
      <div ref={body} onScroll={() => sync(body.current, top.current)} className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
