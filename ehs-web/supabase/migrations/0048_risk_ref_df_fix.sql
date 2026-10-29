-- 0047 rebuild_risk_ref_df : Supabase(pg_safeupdate)는 WHERE 없는 DELETE 를 막음 → where true
create or replace function public.rebuild_risk_ref_df() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  -- 가져오기 스크립트(service role, 로그인 없음) 또는 관리자
  if auth.uid() is not null and not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception '관리자만 할 수 있습니다.';
  end if;
  delete from risk_gram_df where true;
  insert into risk_gram_df (gram, df)
  select g, count(*) from risk_refs r cross join lateral unnest(array(select distinct unnest(r.title_grams || r.body_grams))) g group by g;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.rebuild_risk_ref_df() from public, anon;
