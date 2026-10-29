"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SopTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: "/sop", label: "표준운전절차서 현황", active: pathname === "/sop" },
    { href: "/sop/new", label: "표준운전절차서 작성", active: pathname === "/sop/new" },
  ];
  return (
    <div className="-mb-px flex gap-1 overflow-x-auto">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`shrink-0 border-b-[3px] px-4 py-2.5 text-sm whitespace-nowrap ${
            t.active ? "border-brand-700 font-bold text-brand-800" : "border-transparent text-gray-600 hover:text-brand-800"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
