"use client";

export function PrintBar({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2 shadow-sm">
      <div>
        <p className="text-sm font-bold text-gray-900">🖶 {title}</p>
        <p className="text-xs text-gray-500">{sub}</p>
      </div>
      <span className="flex-1" />
      <button onClick={() => window.print()} className="rounded-md bg-brand-800 px-3 py-2 text-sm font-medium text-white hover:bg-brand-900">
        인쇄 / PDF 저장
      </button>
      <button onClick={() => window.close()} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
        닫기
      </button>
    </div>
  );
}
