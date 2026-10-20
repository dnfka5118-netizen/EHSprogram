"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// 넓은 표 : 가로 스크롤 바를 화면 아래쪽에 붙여 하나만 둔다
//   (표 끝까지 내리지 않아도 좌우로 이동 · 표 자체의 스크롤 바는 숨김, 휴대폰은 손가락으로 밀기)
export function ScrollX({ children, className = "" }: { children: ReactNode; className?: string }) {
  const bar = useRef<HTMLDivElement>(null);
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
        ref={body}
        onScroll={() => sync(body.current, bar.current)}
        className={`overflow-x-auto ${overflow ? "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : ""}`}
      >
        {children}
      </div>
      <div
        ref={bar}
        onScroll={() => sync(bar.current, body.current)}
        className={`sticky bottom-0 z-10 overflow-x-auto overflow-y-hidden border-t border-gray-100 bg-white/95 ${overflow ? "h-4" : "hidden"}`}
        aria-hidden
      >
        <div style={{ width, height: 1 }} />
      </div>
    </div>
  );
}
