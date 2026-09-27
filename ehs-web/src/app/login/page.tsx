import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { e } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-800 text-lg font-bold text-white">
            EHS
          </div>
          <h1 className="text-xl font-bold text-gray-900">환경안전 통합관리</h1>
          <p className="mt-1 text-sm text-gray-500">회사 이메일로 로그인하세요</p>
        </div>
        {e === "inactive" && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">사용할 수 없는 계정입니다. 관리자에게 문의하세요.</p>
        )}
        <LoginForm />
        <p className="mt-4 text-center text-xs text-gray-500">비밀번호를 잊은 경우 환경안전팀에 초기화를 요청하세요.</p>
      </div>
    </main>
  );
}
