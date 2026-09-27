import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getModuleAccess } from "@/lib/access";
import { logout } from "@/app/login/actions";
import { NavLink } from "@/components/NavLink";

export default async function MainLayout({ children }: LayoutProps<"/">) {
  const profile = await requireProfile();
  if (profile.must_change_password) redirect("/account/password");

  const modules = (await getModuleAccess()).filter((m) => m.is_enabled && m.form === "finding" && m.level !== "none");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-emerald-950 bg-emerald-900 text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="rounded bg-white px-1.5 py-0.5 text-xs text-emerald-900">EHS</span>
            <span className="hidden sm:inline">환경안전 통합관리</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/account/password" className="text-emerald-50 hover:underline">
              {profile.name}
              {profile.user_type === "contractor" && <span className="ml-1 text-xs text-emerald-200">(협력업체)</span>}
            </Link>
            <form action={logout}>
              <button className="rounded border border-emerald-700 px-2 py-1 text-xs hover:bg-emerald-800">로그아웃</button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-2 text-sm">
          <NavLink href="/" exact>내 할 일</NavLink>
          {modules.map((m) => (
            <NavLink key={m.code} href={`/insp/${m.slug}`}>
              {m.name}
            </NavLink>
          ))}
          {profile.is_admin && <NavLink href="/settings">환경설정</NavLink>}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
    </div>
  );
}
