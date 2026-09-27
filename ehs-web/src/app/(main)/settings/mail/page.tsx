import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { mailConfigured } from "@/lib/mail";
import { Card, SubmitButton } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { fmtDateTime } from "@/lib/format";
import { sendTestMail } from "../actions";

const STATUS: Record<string, string> = {
  pending: "대기",
  sending: "발송 중",
  sent: "발송",
  failed: "실패",
  expired: "만료",
};

export default async function MailPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, subject, status, attempts, last_error, created_at, sent_at, finding_id, profiles(name, email)")
    .order("created_at", { ascending: false })
    .limit(100);
  const configured = mailConfigured();

  return (
    <div className="space-y-4">
      <Card title="발송 설정">
        <dl className="grid gap-2 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs text-gray-500">SMTP 서버</dt>
            <dd>{configured ? `${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}` : <span className="text-red-600">미설정</span>}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">보내는 사람</dt>
            <dd>{process.env.MAIL_FROM || "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">아침 요약 메일</dt>
            <dd>{process.env.CRON_SECRET ? "매일 08:00" : <span className="text-amber-700">CRON_SECRET 미설정</span>}</dd>
          </div>
        </dl>
        {!configured && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            SMTP 설정 전에도 알림은 대기열에 쌓이며, 설정 후 3일 이내 알림은 자동 발송됩니다.
          </p>
        )}
        <ActionForm action={sendTestMail} className="mt-3">
          <SubmitButton variant="secondary" disabled={!configured}>
            나에게 테스트 메일 보내기
          </SubmitButton>
        </ActionForm>
      </Card>

      <Card title="최근 알림 (100건)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 text-left text-xs text-gray-500">
              <tr>
                <th className="px-2 py-2 font-medium">생성</th>
                <th className="px-2 py-2 font-medium">받는 사람</th>
                <th className="px-2 py-2 font-medium">제목</th>
                <th className="px-2 py-2 font-medium">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data ?? []).map((n) => {
                const p = n.profiles as unknown as { name: string; email: string } | null;
                return (
                  <tr key={n.id}>
                    <td className="px-2 py-2 text-xs whitespace-nowrap text-gray-500">{fmtDateTime(n.created_at)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{p?.name}</td>
                    <td className="px-2 py-2">
                      {n.finding_id ? (
                        <Link href={`/findings/${n.finding_id}`} className="hover:underline">{n.subject}</Link>
                      ) : (
                        n.subject
                      )}
                    </td>
                    <td className={`px-2 py-2 text-xs whitespace-nowrap ${n.status === "failed" ? "text-red-600" : "text-gray-600"}`} title={n.last_error ?? ""}>
                      {STATUS[n.status] ?? n.status}
                      {n.status === "failed" && ` (${n.attempts}회)`}
                    </td>
                  </tr>
                );
              })}
              {(data ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-gray-500">알림 내역이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
