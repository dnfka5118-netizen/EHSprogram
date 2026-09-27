import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 허가서 현장 기록(손서명 이미지 여러 장)을 한 번에 저장 — Vercel 요청 한도(4.5MB) 안쪽
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
