import "server-only";
import { createClient } from "@supabase/supabase-js";

// 서비스 롤 클라이언트 : RLS 를 우회하므로 관리자 확인 후에만 사용
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
