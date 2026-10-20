import { LoginForm } from "./LoginForm";

// 로그인 : 파란 그라데이션 + 점 지도 무늬 + 아래쪽 흰 물결 · 왼쪽 대시보드 그림(모니터 · 떠 있는 카드) · 오른쪽 로그인 카드
//   그림은 모두 이 파일의 SVG/CSS (외부 이미지 없음) · 휴대폰은 제목 + 카드만
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { e, next } = await searchParams;
  const year = new Date().getFullYear();
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-[#0a5bd3] via-[#1677e8] to-[#22a2f2] text-white">
      <DotMap />
      {/* 아래쪽 흰 물결 */}
      <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full sm:h-40" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden>
        <path d="M0 120 C 240 40 420 40 660 110 S 1080 190 1440 90 L1440 200 L0 200 Z" fill="#ffffff" opacity="0.35" />
        <path d="M0 150 C 300 80 520 90 760 140 S 1160 200 1440 130 L1440 200 L0 200 Z" fill="#ffffff" />
      </svg>

      {/* 위쪽 제목 */}
      <header className="relative z-10 flex items-center justify-center gap-3 px-4 pt-8 sm:pt-10">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-symbol.png" alt="" className="h-7 w-7" />
        </span>
        <div className="text-center sm:text-left">
          <p className="text-xl font-bold tracking-wide drop-shadow sm:text-2xl">삼영순화 시스템 통합관리</p>
          <p className="text-[11px] font-semibold tracking-[0.35em] text-white/75 uppercase">Smart System</p>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center justify-center gap-10 px-4 pt-6 pb-32 lg:justify-between lg:px-10 lg:pb-40">
        <Illustration />

        {/* 로그인 카드 */}
        <section className="w-full max-w-sm shrink-0">
          <div className="rounded-2xl bg-white p-6 text-gray-900 shadow-[0_20px_60px_-15px_rgba(8,47,120,0.55)] sm:p-8">
            <div className="mb-5 flex border-b border-gray-200 text-center text-sm font-semibold">
              <span className="-mb-px flex-1 border-b-2 border-[#1677e8] pb-2.5 text-[#1677e8]">로그인</span>
            </div>
            <div className="mb-5 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="삼영순화(주)" className="mx-auto h-8 w-auto" />
              <p className="mt-2 text-xs text-gray-500">회사 이메일로 로그인하세요</p>
            </div>
            {e === "inactive" && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">사용할 수 없는 계정입니다. 관리자에게 문의하세요.</p>}
            {typeof next === "string" && next.startsWith("/d/") && (
              <p className="mb-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">로그인하면 QR 을 찍은 구역의 일일점검 화면이 열립니다.</p>
            )}
            <LoginForm next={typeof next === "string" ? next : undefined} />
            <p className="mt-4 text-center text-xs text-gray-500">비밀번호를 잊은 경우 EHS부서에 초기화를 요청하세요.</p>
          </div>
        </section>
      </div>

      <p className="absolute inset-x-0 bottom-3 z-10 text-center text-[11px] text-gray-500">© {year} SAMYOUNG PURE CHEMICALS CO., LTD. All rights reserved.</p>
    </main>
  );
}

// 옅은 점 지도 무늬 (대륙 모양 대신 흩어진 점 · 가벼운 SVG 패턴)
function DotMap() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]" aria-hidden>
      <defs>
        <pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.4" fill="#fff" />
        </pattern>
        <radialGradient id="fade" cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="mapmask">
          <rect width="100%" height="100%" fill="url(#fade)" />
        </mask>
      </defs>
      <g mask="url(#mapmask)">
        <ellipse cx="22%" cy="38%" rx="14%" ry="16%" fill="url(#dots)" />
        <ellipse cx="34%" cy="66%" rx="7%" ry="14%" fill="url(#dots)" />
        <ellipse cx="54%" cy="34%" rx="9%" ry="12%" fill="url(#dots)" />
        <ellipse cx="58%" cy="60%" rx="7%" ry="13%" fill="url(#dots)" />
        <ellipse cx="74%" cy="36%" rx="16%" ry="15%" fill="url(#dots)" />
        <ellipse cx="86%" cy="68%" rx="6%" ry="7%" fill="url(#dots)" />
      </g>
    </svg>
  );
}

// 왼쪽 그림 : 모니터 대시보드 + 떠 있는 유리 카드 (PC 에서만)
function Illustration() {
  const glass = "absolute rounded-xl border border-white/40 bg-white/15 shadow-lg backdrop-blur-sm";
  return (
    <div className="relative hidden h-[420px] w-[560px] shrink-0 lg:block" aria-hidden>
      {/* 뒤쪽 창 */}
      <div className={`${glass} top-2 left-[230px] h-36 w-60 p-4`}>
        <div className="h-2 w-24 rounded bg-white/70" />
        <div className="mt-3 space-y-2">
          {[80, 64, 72, 50].map((w, i) => (
            <div key={i} className="h-1.5 rounded bg-white/45" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>

      {/* 모니터 */}
      <div className="absolute top-20 left-16 w-[380px]">
        <div className="rounded-xl border-[6px] border-white bg-white p-4 shadow-2xl">
          <div className="flex items-center gap-4">
            <svg viewBox="0 0 80 80" className="h-24 w-24">
              <circle cx="40" cy="40" r="30" fill="none" stroke="#e5eefb" strokeWidth="9" />
              <circle cx="40" cy="40" r="30" fill="none" stroke="#1677e8" strokeWidth="9" strokeLinecap="round" strokeDasharray="188.5" strokeDashoffset="26" transform="rotate(-90 40 40)" />
              <circle cx="40" cy="40" r="30" fill="none" stroke="#22c3a6" strokeWidth="9" strokeLinecap="round" strokeDasharray="188.5" strokeDashoffset="160" transform="rotate(-90 40 40)" />
              <text x="40" y="45" textAnchor="middle" fontSize="15" fontWeight="700" fill="#0b2a55">
                86%
              </text>
            </svg>
            <svg viewBox="0 0 200 90" className="h-24 flex-1">
              <polyline points="0,70 25,52 50,60 75,30 100,44 125,18 150,36 175,22 200,30" fill="none" stroke="#22c3a6" strokeWidth="3" strokeLinejoin="round" />
              <polyline points="0,80 25,70 50,74 75,58 100,64 125,46 150,56 175,48 200,52" fill="none" stroke="#1677e8" strokeWidth="3" strokeLinejoin="round" opacity="0.8" />
              {[0, 25, 50, 75].map((y) => (
                <line key={y} x1="0" x2="200" y1={y + 10} y2={y + 10} stroke="#eef3fb" />
              ))}
            </svg>
          </div>
          <div className="mt-3 flex gap-2">
            <span className="h-2 flex-1 rounded bg-[#1677e8]" />
            <span className="h-2 flex-1 rounded bg-[#22c3a6]" />
            <span className="h-2 w-10 rounded bg-amber-400" />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {["점검 실시", "개선 완료", "결재 완료"].map((t) => (
              <div key={t} className="rounded-md bg-[#f2f7fe] px-2 py-1.5 text-center text-[10px] font-medium text-[#0b2a55]">
                {t}
              </div>
            ))}
          </div>
        </div>
        <div className="mx-auto h-8 w-14 bg-gradient-to-b from-white to-white/80" />
        <div className="mx-auto h-2.5 w-36 rounded-full bg-white shadow-lg" />
      </div>

      {/* 떠 있는 아이콘 카드 */}
      <div className={`${glass} top-36 left-0 flex h-20 w-20 items-center justify-center`}>
        <Svg d="M12 3 4 7v5c0 4.4 3.4 8.3 8 9 4.6-.7 8-4.6 8-9V7l-8-4Zm-1 13-3.5-3.5 1.4-1.4L11 13.2l4.1-4.1 1.4 1.4L11 16Z" />
      </div>
      <div className="absolute top-14 left-6 flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
        <Svg d="M4 4h6v6H4V4Zm2 2v2h2V6H6Zm8-2h6v6h-6V4Zm2 2v2h2V6h-2ZM4 14h6v6H4v-6Zm2 2v2h2v-2H6Zm8-2h2v2h-2v-2Zm2 2h2v2h-2v-2Zm2-2h2v2h-2v-2Zm-4 4h2v2h-2v-2Zm4 0h2v2h-2v-2Z" color="#1677e8" />
      </div>
      <div className="absolute top-[250px] left-[430px] flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
        <Svg d="M9 2h6a1 1 0 0 1 1 1v1h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3V3a1 1 0 0 1 1-1Zm1 2v2h4V4h-4Zm-2.5 9.5 1.4-1.4L11 14.2l4.1-4.1 1.4 1.4L11 17l-3.5-3.5Z" color="#22c3a6" />
      </div>
      <div className="absolute top-[350px] left-[300px] flex h-11 w-11 items-center justify-center rounded-full bg-white/90 shadow-lg">
        <Svg d="M3 5h18v12H8l-5 4V5Zm4 4v2h10V9H7Zm0 3v2h7v-2H7Z" color="#1677e8" />
      </div>
      <div className={`${glass} top-[300px] left-[470px] h-16 w-24 p-2.5`}>
        <div className="h-1.5 w-12 rounded bg-white/80" />
        <div className="mt-2 flex h-6 items-end gap-1">
          {[40, 70, 55, 90, 65].map((h, i) => (
            <span key={i} className="w-2.5 rounded-sm bg-white/70" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Svg({ d, color = "#ffffff" }: { d: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill={color}>
      <path d={d} />
    </svg>
  );
}
