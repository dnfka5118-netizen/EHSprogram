"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

export type MenuLeaf = { label: string; href: string; match?: string[] };
export type MenuGroup = { label: string; href?: string; items?: MenuLeaf[]; soon?: boolean };
export type ShellUser = { name: string; orgLabel: string; contractor: boolean };

const isActive = (pathname: string, leaf: { href: string; match?: string[] }) =>
  [leaf.href, ...(leaf.match ?? [])].some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p + "/")));

// 좌측 메뉴 + 상단 바 (PC : 고정 사이드바 / 휴대폰 : ☰ 서랍)
export function AppShell({ user, menu, logout, children }: { user: ShellUser; menu: MenuGroup[]; logout: () => Promise<void>; children: ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [opened, setOpened] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(menu.map((g) => [g.label, (g.items ?? []).some((i) => isActive(pathname, i)) || g.label === "점검"])),
  );
  const close = () => setDrawer(false);

  const sidebar = (
    <nav className="flex h-full w-60 flex-col bg-brand-900 text-white">
      <Link href="/" onClick={close} className="flex h-16 shrink-0 items-center gap-2 bg-white px-4 text-brand-900">
        <span className="rounded-md bg-brand-800 px-1.5 py-1 text-xs font-bold text-white">EHS</span>
        <span className="leading-tight">
          <b className="block text-[15px]">환경안전 통합관리</b>
          <span className="text-[11px] text-gray-500">EHS 시스템</span>
        </span>
      </Link>

      <div className="flex h-12 shrink-0 items-center justify-between bg-brand-800 px-4">
        <Link href="/" onClick={close} className={`flex items-center gap-2 text-sm ${pathname === "/" ? "font-bold" : ""}`} title="내 할 일">
          <HomeIcon /> 내 할 일
        </Link>
        <button
          type="button"
          onClick={() => (drawer ? close() : setCollapsed(true))}
          className="rounded p-1 hover:bg-white/10"
          aria-label="메뉴 접기"
        >
          <MenuIcon />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {menu.map((g) => {
          if (g.href) {
            const active = isActive(pathname, { href: g.href });
            return (
              <Link
                key={g.label}
                href={g.href}
                onClick={close}
                className={`flex items-center justify-between border-b border-white/10 px-4 py-3 text-[15px] font-medium ${active ? "bg-brand-950" : "hover:bg-white/5"}`}
              >
                {g.label}
              </Link>
            );
          }
          const open = opened[g.label];
          return (
            <div key={g.label} className="border-b border-white/10">
              <button
                type="button"
                disabled={g.soon}
                onClick={() => setOpened((o) => ({ ...o, [g.label]: !o[g.label] }))}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-[15px] font-medium hover:bg-white/5 disabled:cursor-default disabled:text-white/40 disabled:hover:bg-transparent"
              >
                <span>
                  {g.label}
                  {g.soon && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-normal">준비 중</span>}
                </span>
                {!g.soon && <span className="text-lg leading-none">{open ? "−" : "+"}</span>}
              </button>
              {open && g.items && (
                <ul className="bg-brand-950 py-1">
                  {g.items.map((i) => {
                    const active = isActive(pathname, i);
                    return (
                      <li key={i.href}>
                        <Link
                          href={i.href}
                          onClick={close}
                          className={`block py-2 pr-4 pl-7 text-sm ${active ? "font-medium text-sky-300" : "text-white/85 hover:text-white"}`}
                        >
                          {i.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen">
      {/* PC 사이드바 */}
      {!collapsed && <aside className="fixed inset-y-0 left-0 z-30 hidden lg:block">{sidebar}</aside>}
      {/* 휴대폰 서랍 */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <aside className="absolute inset-y-0 left-0 shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className={collapsed ? "" : "lg:pl-60"}>
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 lg:px-6">
          <button
            type="button"
            onClick={() => (collapsed ? setCollapsed(false) : setDrawer(true))}
            className={`rounded p-1.5 text-brand-900 hover:bg-gray-100 ${collapsed ? "" : "lg:hidden"}`}
            aria-label="메뉴 열기"
          >
            <MenuIcon />
          </button>
          <Link href="/" className="font-bold text-brand-900 lg:hidden">
            EHS 통합관리
          </Link>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Link
              href="/account/password"
              className="hidden items-center gap-1.5 rounded-md bg-gray-100 px-3 py-1.5 text-gray-700 hover:bg-gray-200 sm:flex"
              title="개인설정"
            >
              <span className="text-xs text-gray-500">{user.orgLabel}</span>
              <b className="font-medium text-brand-900">{user.name}</b>
              {user.contractor && <span className="text-xs text-gray-500">(협력업체)</span>}
            </Link>
            <Link href="/account/password" className="font-medium text-brand-900 sm:hidden">
              {user.name}
            </Link>
            <form action={logout}>
              <button className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50">로그아웃</button>
            </form>
          </div>
        </header>
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 3 2 12h3v8h5v-5h4v5h5v-8h3z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
