import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PrintBar } from "../PrintButton";
import { qrPath, type DailyPoint } from "@/lib/daily";
import "../paper.css";

// 현장 부착용 QR (A4 한 장에 2개) — 관리자만
export default async function DailyQrPrintPage({ searchParams }: PageProps<"/print/daily-qr">) {
  const me = await getProfile();
  if (!me?.is_admin) redirect("/");
  const { point } = await searchParams;
  const supabase = await createClient();
  let q = supabase
    .from("daily_points")
    .select("*, daily_area_points(daily_areas(name, form_code, is_active))")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (typeof point === "string") q = q.eq("id", point);
  const { data } = await q;
  type Row = DailyPoint & { daily_area_points: { daily_areas: { name: string; form_code: string; is_active: boolean } | null }[] };
  const areas = ((data ?? []) as Row[]).map((p) => ({
    ...p,
    who: p.daily_area_points.map((x) => x.daily_areas).filter((a) => a?.is_active).map((a) => a!.name.replace(/\s*\([A-D]형\)$/, "")),
    forms: [...new Set(p.daily_area_points.map((x) => x.daily_areas?.form_code).filter(Boolean))],
  }));

  const h = await headers();
  // 지금 이 화면을 연 주소 그대로 (APP_URL 은 아직 연결 안 된 도메인일 수 있어 쓰지 않음) — 인쇄 전에 아래 주소로 접속되는지 확인
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const cards = await Promise.all(
    areas.map(async (a) => ({ ...a, url: origin + qrPath(a.qr_token), svg: await QRCode.toString(origin + qrPath(a.qr_token), { type: "svg", margin: 1, errorCorrectionLevel: "M" }) })),
  );

  return (
    <div className="paper-screen">
      <PrintBar title="관리감독자 일일점검 QR 인쇄" sub={`A4 세로 · 한 장에 2개 · ${cards.length}곳 · QR 주소 ${origin}`} />
      <style>{`@page { size: A4 portrait; margin: 10mm; } .qr-card { break-inside: avoid; }`}</style>
      <div className="mx-auto grid max-w-[190mm] gap-[8mm] bg-white p-[6mm] print:p-0">
        {cards.map((c) => (
          <div key={c.id} className="qr-card flex h-[128mm] flex-col items-center justify-center rounded-xl border-4 border-brand-800 p-[6mm] text-center">
            <p className="text-[13pt] font-bold text-brand-800">안전보건 관리감독자 일일점검</p>
            <p className="mt-1 text-[22pt] leading-tight font-extrabold break-keep text-gray-900">{c.name}</p>
            <p className="mt-1 text-[11pt] text-gray-600">
              {c.forms.map((f) => `${f}형`).join(" · ")}
              {c.who.length ? ` · 관리감독자 ${c.who.join(", ")}` : ""}
            </p>
            <div className="mt-3 h-[70mm] w-[70mm] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: c.svg }} />
            <p className="mt-3 text-[11pt] break-keep text-gray-700">담당 관리감독자가 휴대폰 카메라로 찍으면 본인 점검표가 열립니다.</p>
            <p className="mt-1 font-mono text-[7pt] break-all text-gray-400">{c.url}</p>
          </div>
        ))}
        {cards.length === 0 && <p className="p-8 text-center text-sm text-gray-500">인쇄할 구역이 없습니다.</p>}
      </div>
    </div>
  );
}
