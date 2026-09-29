import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 허가서 현장 기록(손서명 이미지 여러 장)을 한 번에 저장 — Vercel 요청 한도(4.5MB) 안쪽
    serverActions: { bodySizeLimit: "4mb" },
    // 한 번 연 화면은 30초 동안 즉시 다시 보여 줌 (저장·결재 등 처리 후에는 바로 새로 불러옴)
    staleTimes: { dynamic: 30, static: 300 },
  },
};

export default nextConfig;
