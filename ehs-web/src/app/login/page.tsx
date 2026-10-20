import { LoginForm } from "./LoginForm";

// 로그인 : 회사 홈페이지처럼 — 흐린 공장 사진 배경 + 왼쪽 회사 소개(사진 원본 비율) + 오른쪽 로그인 카드
//   휴대폰은 사진 띠 아래에 카드 (사진은 원본 945×327 이라 크게 늘리지 않음)
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { e, next } = await searchParams;
  const year = new Date().getFullYear();
  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#cfe4f6] via-[#eaf3fb] to-white">
      {/* 배경 : 같은 사진을 크게 흐리게 (PC) */}
      <div className="absolute inset-0 hidden scale-110 bg-[url('/login-bg.jpg')] bg-cover bg-center opacity-40 blur-2xl lg:block" aria-hidden />
      <div className="absolute inset-0 hidden bg-gradient-to-br from-white/30 via-transparent to-[#0b2a55]/25 lg:block" aria-hidden />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col lg:flex-row lg:items-center lg:gap-12 lg:px-8">
        {/* 회사 소개 */}
        <section className="w-full lg:flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/login-bg.jpg" alt="삼영순화 천안사업장" className="block w-full lg:rounded-2xl lg:shadow-2xl lg:ring-1 lg:ring-white/60" />
          <div className="mt-6 hidden lg:block">
            <p className="text-sm font-semibold tracking-[0.25em] text-sky-700">SAMYOUNG PURE CHEMICALS</p>
            <h2 className="mt-2 text-3xl leading-snug font-bold text-[#0b2a55]">
              환경 · 보건 · 안전을 하나로,
              <br />
              시스템 통합관리
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2 text-sm text-[#0b2a55]">
              {["사내 안전점검", "관리감독자 일일점검", "유해화학물질 자체점검", "위험성평가", "안전작업허가", "전자결재"].map((t) => (
                <li key={t} className="rounded-full bg-white/70 px-3 py-1 shadow-sm ring-1 ring-sky-100">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 로그인 */}
        <section className="mx-auto -mt-6 w-full max-w-sm px-4 pb-8 lg:mx-0 lg:mt-0 lg:w-96 lg:max-w-none lg:shrink-0 lg:px-0 lg:pb-0">
          <div className="rounded-2xl border border-white/70 bg-white/95 p-6 shadow-2xl backdrop-blur sm:p-8">
            <div className="mb-6 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="삼영순화(주)" className="mx-auto mb-4 h-9 w-auto" />
              <h1 className="text-2xl font-bold tracking-tight text-[#0b2a55]">시스템 통합관리</h1>
              <p className="mt-0.5 text-xs font-semibold tracking-[0.3em] text-sky-600 uppercase">Smart System</p>
              <p className="mt-3 text-sm text-gray-500">회사 이메일로 로그인하세요</p>
            </div>
            {e === "inactive" && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">사용할 수 없는 계정입니다. 관리자에게 문의하세요.</p>}
            {typeof next === "string" && next.startsWith("/d/") && (
              <p className="mb-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">로그인하면 QR 을 찍은 구역의 일일점검 화면이 열립니다.</p>
            )}
            <LoginForm next={typeof next === "string" ? next : undefined} />
            <p className="mt-4 text-center text-xs text-gray-500">비밀번호를 잊은 경우 EHS부서에 초기화를 요청하세요.</p>
          </div>
          <p className="mt-4 text-center text-[11px] text-gray-500">© {year} SAMYOUNG PURE CHEMICALS CO., LTD. All rights reserved.</p>
        </section>
      </div>
    </main>
  );
}
