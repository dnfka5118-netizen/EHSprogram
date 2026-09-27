// Supabase/Postgres 오류를 사용자용 문구로
export function toMessage(error: unknown): string {
  if (!error) return "알 수 없는 오류가 발생했습니다.";
  const msg = typeof error === "object" && error && "message" in error ? String(error.message) : String(error);
  if (msg.includes("Invalid login credentials")) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (msg.includes("duplicate key")) return "이미 등록된 값입니다.";
  if (msg.includes("violates foreign key")) return "다른 데이터에서 사용 중이라 처리할 수 없습니다.";
  if (msg.includes("already been registered")) return "이미 가입된 이메일입니다.";
  return msg;
}
