"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function PermitTabs() {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  const tabs = [
    { href: "/permit", label: "안전작업허가 현황", active: pathname === "/permit" && tab !== "today" },
    { href: "/permit?tab=today", label: "금일 작업 현황", active: pathname === "/permit" && tab === "today" },
    { href: "/permit/new", label: "안전작업허가 신청", active: pathname === "/permit/new" },
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
