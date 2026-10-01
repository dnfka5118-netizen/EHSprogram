"use client";

import { useEffect, useRef, useState } from "react";

// 말로 입력 : 브라우저 음성 인식(Web Speech API, 한국어)으로 받아쓴 글을 onText 로 넘김
//   크롬(안드로이드·PC) · 사파리(아이폰) · 삼성 인터넷에서 동작, 지원하지 않는 브라우저에서는 버튼을 숨김
//   음성은 브라우저 회사(구글·애플)의 인식 서버에서 글자로 바뀜
/* eslint-disable @typescript-eslint/no-explicit-any */
type Recognition = any;

function getRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceButton({ onText, className = "" }: { onText: (text: string) => void; className?: string }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const rec = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText; // 최신 입력값에 이어 붙이도록
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
    const r = new R();
    r.lang = "ko-KR";
    r.interimResults = true;
    r.continuous = true;
    r.onresult = (e: any) => {
      let finalText = "";
      let temp = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else temp += t;
      }
      if (finalText.trim()) onTextRef.current(finalText.trim());
      setInterim(temp);
    };
    r.onerror = (e: any) => {
      setError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "마이크 사용을 허용해 주세요 (브라우저 주소창 옆 자물쇠 → 마이크 허용)" : e.error === "no-speech" ? "말소리가 들리지 않았습니다." : "음성 인식을 하지 못했습니다.");
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
    };
    rec.current = r;
    r.start();
    setListening(true);
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
        {listening ? "듣는 중… (누르면 끝)" : "말로 입력"}
      </button>
      {interim && <span className="max-w-64 truncate text-xs text-gray-500">{interim}</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
