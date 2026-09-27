import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { createAdminClient } from "./supabase/admin";

let transporter: Transporter | null = null;

export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function renderMail(name: string, body: string, link: string | null) {
  const appUrl = process.env.APP_URL ?? "";
  const html = `<div style="font-family:'Malgun Gothic',sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
  <div style="background:#064e3b;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0;font-weight:bold">EHS 환경안전 통합관리</div>
  <div style="border:1px solid #e5e7eb;border-top:0;padding:18px;border-radius:0 0 8px 8px;line-height:1.6">
    <p>${esc(name)}님,</p>
    <p style="white-space:pre-line">${esc(body)}</p>
    ${link ? `<p style="margin-top:20px"><a href="${esc(link)}" style="background:#065f46;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">바로가기</a></p>` : ""}
    <p style="margin-top:24px;font-size:12px;color:#6b7280">본 메일은 발신 전용입니다. ${appUrl ? `<a href="${esc(appUrl)}" style="color:#6b7280">${esc(appUrl)}</a>` : ""}</p>
  </div></div>`;
  const text = `${name}님,\n\n${body}${link ? `\n\n바로가기: ${link}` : ""}`;
  return { html, text };
}

export async function sendMail(to: string, subject: string, html: string, text: string) {
  await getTransporter().sendMail({ from: process.env.MAIL_FROM, to, subject, html, text });
}

type Claimed = { id: string; finding_id: string | null; subject: string; body: string; email: string; name: string };

// 발송 대기열 처리 : 처리 직후(after) 와 매일 아침(cron) 에 호출
export async function processOutbox(limit = 30): Promise<{ sent: number; failed: number }> {
  if (!mailConfigured()) return { sent: 0, failed: 0 };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_notifications", { p_limit: limit });
  if (error) {
    console.error("[mail] 대기열 조회 실패", error.message);
    return { sent: 0, failed: 0 };
  }
  let sent = 0;
  let failed = 0;
  for (const n of (data ?? []) as Claimed[]) {
    const link = n.finding_id && process.env.APP_URL ? `${process.env.APP_URL}/findings/${n.finding_id}` : process.env.APP_URL ?? null;
    const { html, text } = renderMail(n.name, n.body, link);
    try {
      await sendMail(n.email, n.subject, html, text);
      await admin.rpc("finish_notification", { p_id: n.id, p_ok: true, p_error: null });
      sent++;
    } catch (e) {
      await admin.rpc("finish_notification", { p_id: n.id, p_ok: false, p_error: e instanceof Error ? e.message : String(e) });
      failed++;
    }
  }
  return { sent, failed };
}
