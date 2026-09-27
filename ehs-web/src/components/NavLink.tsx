"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, exact, children }: { href: string; exact?: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-md px-3 py-1.5 whitespace-nowrap ${
        active ? "bg-white font-medium text-emerald-900" : "text-emerald-50 hover:bg-emerald-800"
      }`}
    >
      {children}
    </Link>
  );
}
