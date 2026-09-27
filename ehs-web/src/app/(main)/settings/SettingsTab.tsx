"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function SettingsTab({ href, children }: { href: string; children: ReactNode }) {
  const active = usePathname().startsWith(href);
  return (
    <Link
      href={href}
      className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap ${
        active ? "border-emerald-800 font-medium text-emerald-900" : "border-transparent text-gray-600 hover:text-gray-900"
      }`}
    >
      {children}
    </Link>
  );
}
