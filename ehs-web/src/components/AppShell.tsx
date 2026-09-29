"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";

export type MenuLeaf = { label: string; href: string; match?: string[] };
export type MenuIconKey = "inspect" | "risk" | "permit" | "settings";
export type MenuGroup = { label: string; icon: MenuIconKey; href?: string; items?: MenuLeaf[]; soon?: boolean };
export type ShellUser = { name: string; orgLabel: string; contractor: boolean };

const isActive = (pathname: string, leaf: { href: string; match?: string[] }) =>
  [leaf.href, ...(leaf.match ?? [])].some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p + "/")));

// PC 사이드바 접힘 상태 : 브라우저에 기억 (저장소를 못 쓰면 펼친 상태)
const KEY = "ehs.sidebar.collapsed";
const listeners = new Set<() => void>();
const readCollapsed = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
const writeCollapsed = (v: boolean) => {
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    // 무시
  }
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// 상단 헤더(고정) + 좌측 사이드바(펼침 240px ↔ 아이콘 막대 64px)
export function AppShell({ user, menu, approvalCount, logout, children }: {
  user: ShellUser;
  menu: MenuGroup[];
  approvalCount: number;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false); // PC
  const [mobileOpen, setMobileOpen] = useState(false); // 휴대폰 : 기본은 아이콘 막대
  const [opened, setOpened] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(menu.map((g) => [g.label, (g.items ?? []).some((i) => isActive(pathname, i)) || g.label === "점검"])),
  );

  const expand = (group?: string) => {
    if (group) setOpened((o) => ({ ...o, [group]: true }));
    writeCollapsed(false);
    setMobileOpen(true);
  };
  const fold = () => {
    writeCollapsed(true);
    setMobileOpen(false);
  };
  const afterNav = () => setMobileOpen(false);

  // ---------------- 펼친 메뉴 ----------------
  const full = (
    <nav className="flex h-full w-60 flex-col bg-brand-900 text-white">
      <div className="flex h-12 shrink-0 items-center justify-between bg-brand-800 pr-2 pl-4">
        <Link href="/" onClick={afterNav} className={`flex items-center gap-2 text-sm ${pathname === "/" ? "font-bold" : ""}`}>
          <Icon name="home" /> 내 할 일
        </Link>
        <button type="button" onClick={fold} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-white/80 hover:bg-white/10 hover:text-white" title="메뉴 접기">
          <Icon name="fold" size={16} /> 접기
        </button>
      </div>
      <div className="shrink-0 bg-brand-800 px-3 pb-3">
        <Link
          href="/approvals"
          onClick={afterNav}
          className={`flex items-center justify-center gap-2 rounded border border-white/40 py-1.5 text-sm hover:bg-white/10 ${pathname.startsWith("/approvals") ? "bg-white/15" : ""}`}
        >
          <Icon name="approval" size={16} /> 전자결재
          {approvalCount > 0 && <span className="min-w-5 rounded-full bg-orange-500 px-1.5 text-center text-xs leading-5 font-bold">{approvalCount}</span>}
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto">
        {menu.map((g) => {
          if (g.href) {
            return (
              <Link
                key={g.label}
                href={g.href}
                onClick={afterNav}
                className={`flex items-center gap-2.5 border-b border-white/10 px-4 py-3 text-[15px] font-medium ${isActive(pathname, { href: g.href }) ? "bg-brand-950" : "hover:bg-white/5"}`}
              >
                <Icon name={g.icon} size={18} /> {g.label}
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
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[15px] font-medium hover:bg-white/5 disabled:cursor-default disabled:text-white/40 disabled:hover:bg-transparent"
              >
                <Icon name={g.icon} size={18} />
                <span className="flex-1">
                  {g.label}
                  {g.soon && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-normal">준비 중</span>}
                </span>
                {!g.soon && <span className="text-lg leading-none">{open ? "−" : "+"}</span>}
              </button>
              {open && g.items && (
                <ul className="bg-brand-950 py-1">
                  {g.items.map((i) => (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        onClick={afterNav}
                        className={`block py-2 pr-4 pl-11 text-sm ${isActive(pathname, i) ? "font-medium text-sky-300" : "text-white/85 hover:text-white"}`}
                      >
                        {i.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );

  // ---------------- 아이콘 막대 ----------------
  const railBtn = "relative flex h-11 w-11 items-center justify-center rounded-md hover:bg-white/10";
  const rail = (
    <nav className="flex h-full w-16 flex-col items-center gap-1 bg-brand-900 py-2 text-white">
      <button type="button" onClick={() => expand()} className={railBtn} title="메뉴 펼치기" aria-label="메뉴 펼치기">
        <Icon name="unfold" />
      </button>
      <span className="my-1 h-px w-8 bg-white/15" />
      <Link href="/" className={`${railBtn} ${pathname === "/" ? "bg-white/15" : ""}`} title="내 할 일">
        <Icon name="home" />
      </Link>
      <Link href="/approvals" className={`${railBtn} ${pathname.startsWith("/approvals") ? "bg-white/15" : ""}`} title="전자결재">
        <Icon name="approval" />
        {approvalCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-orange-500 px-1 text-center text-[10px] leading-4 font-bold">{approvalCount}</span>
        )}
      </Link>
      <span className="my-1 h-px w-8 bg-white/15" />
      {menu.map((g) => {
        const active = g.href ? isActive(pathname, { href: g.href }) : (g.items ?? []).some((i) => isActive(pathname, i));
        const cls = `${railBtn} ${active ? "bg-white/15 text-sky-300" : ""} ${g.soon ? "opacity-40" : ""}`;
        return g.href ? (
          <Link key={g.label} href={g.href} className={cls} title={g.label}>
            <Icon name={g.icon} />
          </Link>
        ) : (
          <button key={g.label} type="button" disabled={g.soon} onClick={() => expand(g.label)} className={cls} title={g.soon ? `${g.label} (준비 중)` : g.label}>
            <Icon name={g.icon} />
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className={`min-h-screen [--sidebar-w:4rem] ${collapsed ? "lg:[--sidebar-w:4rem]" : "lg:[--sidebar-w:15rem]"}`}>
      {/* 상단 헤더 : 항상 맨 위 전체 폭 고정 (사이드바를 접어도 그대로) */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center border-b border-gray-200 bg-white">
        <Link href="/" className="flex h-full shrink-0 items-center gap-2 px-4 text-brand-900 lg:w-60">
          <span className="rounded-md bg-brand-800 px-1.5 py-1 text-xs font-bold text-white">EHS</span>
          <span className="leading-tight">
            <b className="block text-[15px]">환경안전 통합관리</b>
            <span className="hidden text-[11px] text-gray-500 sm:block">EHS 시스템</span>
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-2 px-4 text-sm lg:px-6">
          <Link href="/account/password" className="hidden items-center gap-1.5 rounded-md bg-gray-100 px-3 py-1.5 text-gray-700 hover:bg-gray-200 sm:flex" title="개인설정">
            <span className="text-xs text-gray-500">{user.orgLabel}</span>
            <b className="font-medium text-brand-900">{user.name}</b>
            {user.contractor && <span className="text-xs text-gray-500">(협력업체)</span>}
          </Link>
          <Link href="/account/password" className="font-medium text-brand-900 sm:hidden">
            {user.name}
          </Link>
          <form action={logout}>
            <button className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs whitespace-nowrap text-gray-600 hover:bg-gray-50">로그아웃</button>
          </form>
        </div>
      </header>

      {/* 사이드바 : PC 는 접힘 상태에 따라, 휴대폰은 아이콘 막대 + 펼치면 위에 겹쳐서 */}
      <aside className="fixed top-16 bottom-0 left-0 z-30">
        <div className={`hidden h-full lg:block`}>{collapsed ? rail : full}</div>
        <div className="h-full lg:hidden">{rail}</div>
      </aside>
      {mobileOpen && (
        <div className="fixed inset-x-0 top-16 bottom-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 shadow-xl">{full}</aside>
        </div>
      )}

      <div className="pt-16 pl-[var(--sidebar-w)] transition-[padding] duration-200">
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

const PATHS: Record<string, string> = {
  home: "M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10",
  approval: "M9 11l2 2 4-4M5 4h11l3 3v13H5z",
  inspect: "M9 4h6v3H9zM7 5H5v16h14V5h-2M8 12h8M8 16h5",
  risk: "M12 3 2 20h20L12 3zM12 10v4M12 17v.01",
  permit: "M4 17a8 8 0 0 1 16 0zM3 17h18v3H3zM10 9V5h4v4",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  fold: "M11 17l-5-5 5-5M18 17l-5-5 5-5",
  unfold: "M13 17l5-5-5-5M6 17l5-5-5-5",
};

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}
