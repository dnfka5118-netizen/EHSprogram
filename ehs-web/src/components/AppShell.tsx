"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { findDomain, itemKey, matches, type Domain, type DomainKey, type GroupKey, type MenuItem } from "@/lib/menu";
import { KEYS, useStored, write } from "./shell/store";
import { MenuSearch } from "./shell/MenuSearch";
import { saveFavorites } from "./shell/actions";

export type ShellUser = { name: string; orgLabel: string; contractor: boolean };

const FIELD_DOMAINS: DomainKey[] = ["env", "health", "safety"];

// 상단 헤더(분야 탭·메뉴 검색 · 고정) + 좌측 사이드바(선택한 분야 메뉴 · 펼침 240px ↔ 아이콘 막대 64px)
export function AppShell({ user, domains, favorites: savedFavorites, approvalCount, logout, children }: {
  user: ShellUser;
  domains: Domain[];
  favorites: string[];
  approvalCount: number;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const qs = useSearchParams().toString();
  const search = qs ? `?${qs}` : "";
  const collapsed = useStored(KEYS.collapsed) === "1";
  const lastDomain = useStored(KEYS.domain) as DomainKey | null;
  const recentRaw = useStored(KEYS.recent);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(savedFavorites);
  const [, startFav] = useTransition();

  // 지금 보는 분야 : 분야 메뉴면 그 분야, 공통 화면이면 마지막으로 보던 분야 유지
  const pathDomain = findDomain(domains, pathname, search);
  const current: DomainKey = pathDomain && pathDomain !== "common" ? pathDomain : lastDomain && FIELD_DOMAINS.includes(lastDomain) ? lastDomain : "safety";
  const domain = domains.find((d) => d.key === current)!;
  const common = domains.find((d) => d.key === "common")!;
  const allItems = useMemo(() => domains.flatMap((d) => d.sections.flatMap((s) => s.items.map((i) => ({ ...i, domain: d.label })))), [domains]);
  const activeItem = allItems.find((i) => matches(pathname, search, i));

  // 분야·최근 사용 기억
  useEffect(() => {
    if (pathDomain && pathDomain !== "common") write(KEYS.domain, pathDomain);
    if (activeItem?.href && activeItem.href !== "/") {
      let list: string[] = [];
      try {
        list = JSON.parse(recentRaw ?? "[]");
      } catch {
        list = [];
      }
      write(KEYS.recent, JSON.stringify([activeItem.href, ...list.filter((h) => h !== activeItem.href)].slice(0, 5)));
    }
  }, [pathDomain, activeItem?.href, recentRaw]);

  // Ctrl+K / Cmd+K 메뉴 검색
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [opened, setOpened] = useState<Partial<Record<GroupKey, boolean>>>({});
  const isOpen = (k: GroupKey, items: MenuItem[]) => opened[k] ?? (items.some((i) => i.href) || items.some((i) => matches(pathname, search, i)));
  const recent = useMemo(() => {
    try {
      return (JSON.parse(recentRaw ?? "[]") as string[]).map((h) => allItems.find((i) => i.href === h)).filter((x): x is (typeof allItems)[number] => !!x);
    } catch {
      return [];
    }
  }, [recentRaw, allItems]);
  const favItems = favorites.map((h) => allItems.find((i) => i.href === h)).filter((x): x is (typeof allItems)[number] => !!x);

  const toggleFav = (href: string) => {
    const next = favorites.includes(href) ? favorites.filter((h) => h !== href) : [...favorites, href];
    setFavorites(next);
    startFav(async () => {
      const res = await saveFavorites(next);
      if (res.error) {
        setFavorites(favorites);
        alert(`즐겨찾기 저장 실패: ${res.error}`);
      }
    });
  };

  const expand = (group?: GroupKey) => {
    if (group) setOpened((o) => ({ ...o, [group]: true }));
    write(KEYS.collapsed, "0");
    setMobileOpen(true);
  };
  const fold = () => {
    write(KEYS.collapsed, "1");
    setMobileOpen(false);
  };
  const afterNav = () => setMobileOpen(false);

  const leaf = (i: MenuItem & { domain?: string }, opts: { indent?: boolean; showDomain?: boolean } = {}) => {
    const active = matches(pathname, search, i);
    const pad = opts.indent ? "pl-11" : "pl-4";
    if (!i.href)
      return (
        <li key={itemKey(i)} className={`flex items-center py-1.5 pr-3 ${pad} text-sm text-white/35`} title="준비 중">
          {i.label}
          <span className="ml-1.5 rounded bg-white/10 px-1 text-[9px]">준비 중</span>
        </li>
      );
    const fav = favorites.includes(i.href);
    return (
      <li key={itemKey(i)} className="group flex items-center">
        <Link href={i.href} onClick={afterNav} className={`min-w-0 flex-1 truncate py-1.5 ${pad} text-sm ${active ? "font-medium text-sky-300" : "text-white/85 hover:text-white"}`}>
          {i.label}
          {opts.showDomain && i.domain && <span className="ml-1 text-[10px] text-white/40">{i.domain}</span>}
        </Link>
        <button
          type="button"
          onClick={() => toggleFav(i.href!)}
          className={`mr-2 px-1 text-sm ${fav ? "text-amber-300" : "text-white/30 opacity-100 hover:text-amber-200 lg:opacity-0 lg:group-hover:opacity-100"}`}
          title={fav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          aria-label={fav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
        >
          {fav ? "★" : "☆"}
        </button>
      </li>
    );
  };

  // ---------------- 펼친 메뉴 ----------------
  const full = (
    <nav className="flex h-full w-60 flex-col bg-brand-900 text-white">
      <div className="flex h-12 shrink-0 items-center justify-between bg-brand-800 pr-2 pl-4">
        <Link href="/" onClick={afterNav} className={`flex items-center gap-2 text-sm ${pathname === "/" ? "font-bold" : ""}`}>
          <Icon name="home" /> 내 할 일
        </Link>
        <button type="button" onClick={fold} className="hidden items-center gap-1 rounded px-2 py-1 text-xs text-white/80 lg:flex hover:bg-white/10 hover:text-white" title="메뉴 접기">
          <Icon name="fold" size={16} /> 접기
        </button>
      </div>
      <div className="shrink-0 space-y-2 bg-brand-800 px-3 pb-3">
        <Link
          href="/approvals"
          onClick={afterNav}
          className={`flex items-center justify-center gap-2 rounded border border-white/40 py-1.5 text-sm hover:bg-white/10 ${pathname.startsWith("/approvals") ? "bg-white/15" : ""}`}
        >
          <Icon name="approval" size={16} /> 전자결재
          {approvalCount > 0 && <span className="min-w-5 rounded-full bg-orange-500 px-1.5 text-center text-xs leading-5 font-bold">{approvalCount}</span>}
        </Link>
        {/* 분야 전환 (휴대폰 — PC 는 상단 탭) */}
        <div className="grid grid-cols-3 gap-1 lg:hidden">
          {domains
            .filter((d) => d.key !== "common")
            .map((d) => (
              <Link key={d.key} href={d.home} onClick={afterNav} className={`rounded py-1 text-center text-xs ${d.key === current ? "bg-white font-bold text-brand-900" : "bg-white/10"}`}>
                {d.label}({d.short})
              </Link>
            ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        {favItems.length > 0 && (
          <Block title="★ 즐겨찾기">
            <ul>{favItems.map((i) => leaf(i, { showDomain: true }))}</ul>
          </Block>
        )}
        {recent.length > 0 && (
          <Block title="최근 사용">
            <ul>{recent.slice(0, 3).map((i) => leaf(i, { showDomain: true }))}</ul>
          </Block>
        )}

        <Link href={domain.home} onClick={afterNav} className={`flex items-center justify-between px-4 pt-3 pb-1 text-xs font-bold tracking-wide text-white/60 hover:text-white ${pathname === domain.home ? "text-white" : ""}`}>
          <span>
            {domain.label}({domain.short}) 메뉴
          </span>
          <span className="font-normal">대시보드 ›</span>
        </Link>
        {domain.sections.map((s) => {
          const open = isOpen(s.key, s.items);
          const ready = s.items.filter((i) => i.href).length;
          return (
            <div key={s.key} className="border-b border-white/10">
              <button
                type="button"
                onClick={() => setOpened((o) => ({ ...o, [s.key]: !open }))}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[14px] font-medium hover:bg-white/5"
              >
                <Icon name={s.key} size={17} />
                <span className="flex-1">{s.label}</span>
                {ready > 0 && <span className="text-[10px] text-white/40">{ready}</span>}
                <span className="text-base leading-none">{open ? "−" : "+"}</span>
              </button>
              {open && <ul className="bg-brand-950 py-1">{s.items.map((i) => leaf(i, { indent: true }))}</ul>}
            </div>
          );
        })}

        <Block title="공통">
          <ul>{common.sections[0].items.filter((i) => i.href !== "/" && i.href !== "/approvals").map((i) => leaf(i))}</ul>
        </Block>
      </div>
    </nav>
  );

  // ---------------- 아이콘 막대 ----------------
  const railBtn = "relative flex h-10 w-11 items-center justify-center rounded-md hover:bg-white/10";
  const rail = (
    <nav className="flex h-full w-16 flex-col items-center gap-1 overflow-y-auto bg-brand-900 py-2 text-white">
      <button type="button" onClick={() => expand()} className={railBtn} title="메뉴 펼치기" aria-label="메뉴 펼치기">
        <Icon name="unfold" />
      </button>
      <span className="my-1 h-px w-8 shrink-0 bg-white/15" />
      <Link href="/" className={`${railBtn} ${pathname === "/" ? "bg-white/15" : ""}`} title="내 할 일">
        <Icon name="home" />
      </Link>
      <Link href="/approvals" className={`${railBtn} ${pathname.startsWith("/approvals") ? "bg-white/15" : ""}`} title="전자결재">
        <Icon name="approval" />
        {approvalCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-orange-500 px-1 text-center text-[10px] leading-4 font-bold">{approvalCount}</span>}
      </Link>
      <button type="button" onClick={() => expand()} className={`${railBtn} ${favItems.length ? "text-amber-300" : ""}`} title="즐겨찾기">
        <span className="text-lg">★</span>
      </button>
      <span className="my-1 h-px w-8 shrink-0 bg-white/15" />
      {domains
        .filter((d) => d.key !== "common")
        .map((d) => (
          <Link key={d.key} href={d.home} className={`${railBtn} text-sm font-bold ${d.key === current ? "bg-white text-brand-900" : "text-white/70"}`} title={`${d.label}(${d.short})`}>
            {d.short}
          </Link>
        ))}
      <span className="my-1 h-px w-8 shrink-0 bg-white/15" />
      {domain.sections.map((s) => {
        const active = s.items.some((i) => matches(pathname, search, i));
        return (
          <button key={s.key} type="button" onClick={() => expand(s.key)} className={`${railBtn} ${active ? "bg-white/15 text-sky-300" : ""}`} title={`${domain.label} · ${s.label}`}>
            <Icon name={s.key} />
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className={`min-h-screen [--sidebar-w:0px] ${collapsed ? "lg:[--sidebar-w:4rem]" : "lg:[--sidebar-w:15rem]"}`}>
      {/* 상단 헤더 : 항상 맨 위 전체 폭 고정 */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center border-b border-gray-200 bg-white">
        {/* 휴대폰·태블릿 : 왼쪽 메뉴 막대를 숨기고 이 버튼으로 메뉴를 엶 (화면 폭 확보) */}
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          className="flex h-full shrink-0 items-center gap-1 pr-1 pl-3 text-brand-900 lg:hidden"
          aria-label="메뉴 열기"
          aria-expanded={mobileOpen}
        >
          <Icon name="common" size={22} />
          <span className="text-xs font-medium">메뉴</span>
        </button>
        <Link href="/" className="flex h-full min-w-0 shrink items-center gap-2 px-2 text-brand-900 lg:w-60 lg:shrink-0 lg:px-4">
          <span className="rounded-md bg-brand-800 px-1.5 py-1 text-xs font-bold text-white">EHS</span>
          <span className="leading-tight">
            <b className="hidden text-[15px] min-[400px]:block">환경안전 통합관리</b>
            <span className="hidden text-[11px] text-gray-500 sm:block">EHS 시스템</span>
          </span>
        </Link>
        {/* 분야 탭 */}
        <nav className="hidden h-full items-stretch lg:flex">
          {domains.map((d) => {
            const active = d.key === (pathDomain === "common" ? "common" : current);
            return (
              <Link
                key={d.key}
                href={d.home}
                className={`flex items-center gap-1.5 border-b-[3px] px-5 text-[15px] ${active ? "border-brand-700 font-bold text-brand-900" : "border-transparent text-gray-600 hover:text-brand-800"}`}
              >
                {d.key !== "common" && <span className={`flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${active ? "bg-brand-800 text-white" : "bg-gray-100 text-gray-600"}`}>{d.short}</span>}
                {d.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 px-2 text-sm sm:gap-2 sm:px-3 lg:px-6">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 rounded-md border border-gray-300 px-2.5 py-1.5 text-gray-500 hover:border-brand-600 hover:text-brand-800"
            title="메뉴 검색 (Ctrl+K)"
          >
            <Icon name="search" size={16} />
            <span className="hidden md:inline">메뉴 검색</span>
            <kbd className="hidden rounded border border-gray-200 px-1 text-[10px] text-gray-400 xl:inline">Ctrl K</kbd>
          </button>
          <Link href="/account/password" className="hidden items-center gap-1.5 rounded-md bg-gray-100 px-3 py-1.5 text-gray-700 hover:bg-gray-200 sm:flex" title="개인설정">
            <span className="hidden text-xs text-gray-500 xl:inline">{user.orgLabel}</span>
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

      <aside className="fixed top-16 bottom-0 left-0 z-30">
        <div className="hidden h-full lg:block">{collapsed ? rail : full}</div>
      </aside>
      {mobileOpen && (
        <div className="fixed inset-x-0 top-16 bottom-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 shadow-xl">{full}</aside>
        </div>
      )}

      <MenuSearch domains={domains} open={searchOpen} onClose={() => setSearchOpen(false)} />

      <div className="pt-16 pl-[var(--sidebar-w)] transition-[padding] duration-200">
        <main className="p-3 sm:p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-white/10 pb-1">
      <p className="px-4 pt-3 pb-1 text-xs font-bold tracking-wide text-white/60">{title}</p>
      {children}
    </div>
  );
}

const PATHS: Record<string, string> = {
  home: "M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10",
  approval: "M9 11l2 2 4-4M5 4h11l3 3v13H5z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3",
  plan: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  inspect: "M9 4h6v3H9zM7 5H5v16h14V5h-2M8 12h8M8 16h5",
  measure: "M4 20h16M6 16l4-5 3 3 5-7",
  work: "M14 7l3-3 3 3-3 3M17 4l-9 9M4 20l4-1 9-9-3-3-9 9z",
  edu: "M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5",
  accident: "M12 3 2 20h20L12 3zM12 10v4M12 17v.01",
  common: "M4 6h16M4 12h16M4 18h10",
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
