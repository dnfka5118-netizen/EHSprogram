import { createAdminClient } from "@/lib/supabase/admin";
import { mailConfigured, processOutbox } from "@/lib/mail";

export const maxDuration = 300;

// 매일 아침 (vercel.json 의 crons 로 호출, Authorization: Bearer CRON_SECRET)
//  1) 지난해 점검 지표 확정본이 없으면 자동 확정 (1월 1일)
//  2) 단계별 알림 : 영업일에만, 기준 일수는 환경설정 → 알림 (DB queue_reminders 가 사람별 한 통으로 대기열에 넣고 기록)
//  3) SMTP 가 설정돼 있으면 대기열 발송
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  const { data: confirmed, error: kErr } = await admin.rpc("_kpi_auto_confirm");
  if (kErr) return Response.json({ error: kErr.message }, { status: 500 });
  const { data: reminders, error: rErr } = await admin.rpc("queue_reminders");
  if (rErr) return Response.json({ error: rErr.message }, { status: 500 });

  if (!mailConfigured()) return Response.json({ kpiConfirmed: confirmed, reminders, skipped: "SMTP 미설정" });
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < 20; i++) {
    const r = await processOutbox(50);
    sent += r.sent;
    failed += r.failed;
    if (r.sent + r.failed === 0) break;
  }
  return Response.json({ kpiConfirmed: confirmed, reminders, sent, failed });
}
