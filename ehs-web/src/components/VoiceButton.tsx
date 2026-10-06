"use client";

import { useEffect, useRef, useState } from "react";

// 말로 입력 : 브라우저 음성 인식(Web Speech API, 한국어)
//   크롬(안드로이드·PC) · 사파리(아이폰) · 삼성 인터넷에서 동작, 지원하지 않는 브라우저에서는 버튼을 숨김
//   음성은 브라우저 회사(구글·애플)의 인식 서버에서 글자로 바뀜
//
// 중복 입력 방지 : 안드로이드 크롬은 같은 문장을 "확정" 결과로 여러 번 보내거나 앞부분을 겹쳐 보내므로
//   결과가 올 때마다 이어 붙이지 않고, 버튼을 누른 순간의 내용(base) + 이번 인식 전체로 다시 만든다.
//   한 번 말하고 멈추면 자동으로 끝난다 (continuous = false).
/* eslint-disable @typescript-eslint/no-explicit-any */
type Recognition = any;

function getRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// 결과 목록 → 한 문장 : 앞 조각이 다음 조각의 앞부분이면(누적 전송) 뒤 것으로 바꾸고, 같은 조각은 한 번만
export function joinTranscripts(parts: string[]): string {
  const out: string[] = [];
  for (const raw of parts) {
    const t = raw.trim();
    if (!t) continue;
    const last = out.at(-1);
    if (last !== undefined && (t === last || t.startsWith(last))) out[out.length - 1] = t;
    else if (last !== undefined && last.startsWith(t)) continue;
    else out.push(t);
  }
  return out.join(" ");
}

export function VoiceButton({ value, onChange, className = "" }: { value: string; onChange: (text: string) => void; className?: string }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const rec = useRef<Recognition | null>(null);
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });

  // 지원 여부는 브라우저에서만 알 수 있음 (서버 화면과 어긋나지 않도록 마운트 후 확인)
  useEffect(() => {
    const id = requestAnimationFrame(() => setSupported(!!getRecognition()));
    return () => {
      cancelAnimationFrame(id);
      rec.current?.abort?.();
    };
  }, []);

  if (!supported) return null;

  const start = () => {
    const R = getRecognition();
    if (!R) return;
    setError("");
    const base = latest.current.value.trimEnd(); // 이미 적어 둔 내용
    const r = new R();
    r.lang = "ko-KR";
    r.interimResults = true; // 말하는 동안 칸에 바로 보이도록
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onresult = (e: any) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) parts.push(e.results[i][0].transcript);
      const said = joinTranscripts(parts);
      if (said) latest.current.onChange(base ? `${base} ${said}` : said);
    };
    r.onerror = (e: any) => {
      if (e.error === "aborted") return;
      setError(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "마이크 사용을 허용해 주세요 (브라우저 주소창 옆 자물쇠 → 마이크 허용)"
          : e.error === "no-speech"
            ? "말소리가 들리지 않았습니다. 다시 눌러 말해 주세요."
            : "음성 인식을 하지 못했습니다.",
      );
    };
    r.onend = () => {
      setListening(false);
      rec.current = null;
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError("음성 인식을 시작하지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
    }
  };
  const stop = () => rec.current?.stop();

  return (
    <span className={`inline-flex flex-col items-end gap-1 ${className}`}>
      <button
        type="button"
        onClick={listening ? stop : start}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
          listening ? "animate-pulse bg-red-600 text-white" : "border border-brand-700 bg-white text-brand-800 hover:bg-brand-50"
        }`}
        aria-label={listening ? "음성 입력 끝내기" : "말로 입력"}
      >
        <span aria-hidden>{listening ? "■" : "🎤"}</span>
        {listening ? "듣는 중… 말해 주세요" : "말로 입력"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
