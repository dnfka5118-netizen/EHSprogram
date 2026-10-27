import type { NextConfig } from "next";

// 보안 응답 헤더 : 클릭재킹(다른 사이트가 iframe 으로 덮어 [승인] 등을 누르게 함) 차단 + 콘텐츠 보안 정책
//   frame-ancestors 'none' / X-Frame-Options DENY : 어떤 사이트도 이 화면을 iframe 에 넣을 수 없음
//   외부 연결은 꼭 필요한 곳만 : Supabase(데이터·사진·로그인), 사진 인식 모델(cdn.jsdelivr.net · huggingface)
//   'unsafe-inline' : Next.js 가 화면에 넣는 초기 스크립트 · 'unsafe-eval' · 'wasm-unsafe-eval' : 사진 인식(onnxruntime-web) · HEIC 변환(heic-to)
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : "*.supabase.co";
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://${supabase}`,
  "font-src 'self' data:",
  `connect-src 'self' https://${supabase} wss://${supabase} https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 카메라(사진 촬영) · 마이크(말로 입력)는 이 사이트에서만, 그 외 기능은 끔
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

const nextConfig: NextConfig = {
  experimental: {
    // 허가서 현장 기록(손서명 이미지 여러 장)을 한 번에 저장 — Vercel 요청 한도(4.5MB) 안쪽
    serverActions: { bodySizeLimit: "4mb" },
    // 한 번 연 화면은 30초 동안 즉시 다시 보여 줌 (저장·결재 등 처리 후에는 바로 새로 불러옴)
    staleTimes: { dynamic: 30, static: 300 },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
