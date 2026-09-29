"use client";

import { useSyncExternalStore } from "react";

// 브라우저에 기억하는 화면 설정 (사이드바 접힘 · 마지막 분야 · 최근 사용 메뉴)
// 저장소를 쓸 수 없으면(사생활 보호 모드 등) 기본값으로 동작
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  const onStorage = () => l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function write(key: string, value: string) {
  try {
    if (localStorage.getItem(key) === value) return;
    localStorage.setItem(key, value);
  } catch {
    return;
  }
  listeners.forEach((l) => l());
}

export function useStored(key: string): string | null {
  return useSyncExternalStore(subscribe, () => read(key), () => null);
}

export const KEYS = {
  collapsed: "ehs.sidebar.collapsed",
  domain: "ehs.sidebar.domain",
  recent: "ehs.menu.recent",
};
