"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 제목 띠 아래 탭 (현재 경로와 앞부분이 같으면 선택 표시)
export function TabLinks({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <div className="-mb-px flex gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`shrink-0 border-b-[3px] px-4 py-2.5 text-sm whitespace-nowrap ${
              active ? "border-brand-700 font-bold text-brand-800" : "border-transparent text-gray-600 hover:text-brand-800"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
