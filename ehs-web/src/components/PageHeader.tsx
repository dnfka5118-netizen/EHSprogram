import Link from "next/link";
import type { ReactNode } from "react";

export type Crumb = { label: string; href?: string };

// 화면 상단 흰 제목 띠 : 경로 · 제목 · 우측 버튼 · 아래 탭
export function PageHeader({ title, crumbs = [], actions, children }: { title: string; crumbs?: Crumb[]; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="-mx-4 -mt-4 mb-4 border-b border-gray-200 bg-white px-4 pt-3 lg:-mx-6 lg:-mt-6 lg:mb-6 lg:px-6">
      {crumbs.length > 0 && (
        <p className="mb-1 text-xs text-gray-500">
          {crumbs.map((c, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1 text-gray-300">›</span>}
              {c.href ? (
                <Link href={c.href} className="hover:text-brand-700 hover:underline">
                  {c.label}
                </Link>
              ) : (
                c.label
              )}
            </span>
          ))}
        </p>
      )}
      <div className={`flex flex-wrap items-center justify-between gap-2 ${children ? "pb-2" : "pb-3"}`}>
        <h1 className="text-xl font-bold text-brand-950">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
