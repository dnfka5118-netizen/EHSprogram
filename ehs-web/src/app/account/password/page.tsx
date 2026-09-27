import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { PasswordForm } from "./PasswordForm";
import { logout } from "@/app/login/actions";

export default async function PasswordPage() {
  const profile = await requireProfile();
  const forced = profile.must_change_password;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">개인설정 · 비밀번호 변경</h1>
        <p className="mt-1 text-sm text-gray-500">
          {profile.name} ({profile.email})
        </p>
        {forced && (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            첫 로그인입니다. 보안을 위해 초기 비밀번호를 변경한 뒤 이용할 수 있습니다.
          </p>
        )}
        <div className="mt-5">
          <PasswordForm />
        </div>
        <div className="mt-4 flex justify-between text-sm">
          {forced ? <span /> : <Link href="/" className="text-gray-600 hover:underline">← 돌아가기</Link>}
          <form action={logout}>
            <button className="text-gray-500 hover:underline">로그아웃</button>
          </form>
        </div>
      </div>
    </main>
  );
}
