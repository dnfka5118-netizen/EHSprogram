-- [기존 시드니 프로젝트에서만 1회 실행] 사용자 비밀번호(암호화된 값)를 새 프로젝트로 옮기기 위한 임시 함수
-- service_role(secret 키)만 호출할 수 있고, 이전이 끝나면 맨 아래 drop 문으로 지운다.
create or replace function public._export_auth_users()
returns table (id uuid, email text, encrypted_password text, raw_user_meta_data jsonb)
language sql security definer set search_path = '' as $$
  select u.id, u.email::text, u.encrypted_password::text, u.raw_user_meta_data
  from auth.users u
$$;
revoke all on function public._export_auth_users() from public, anon, authenticated;
grant execute on function public._export_auth_users() to service_role;

-- 이전 완료 후 : drop function public._export_auth_users();
