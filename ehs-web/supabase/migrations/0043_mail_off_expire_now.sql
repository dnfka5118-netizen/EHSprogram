-- =====================================================================
-- '보내지 않음' 으로 정한 종류의 알림은 생기는 순간 바로 '만료 (환경설정에서 보내지 않음)'
--   전에는 '대기' 로 쌓였다가 다음 영업일 아침에야 만료로 바뀌어, 메일이 갈 것처럼 보였음
--   · 알림이 들어올 때 (notifications before insert)
--   · 환경설정 → 알림에서 어떤 종류를 '보내지 않음' 으로 바꿀 때 (이미 대기 중인 그 종류도 바로)
--   처리가 늦어진 건(reminder) · 아침 메일(digest) 은 해당 없음
-- =====================================================================

create or replace function public._notification_off_on_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' and new.kind not in ('reminder', 'digest') and mail_mode(new.kind) = 'off' then
    new.status := 'expired';
    new.last_error := '환경설정에서 보내지 않음';
  end if;
  return new;
end $$;
drop trigger if exists notification_off_on_insert on public.notifications;
create trigger notification_off_on_insert before insert on public.notifications
  for each row execute function public._notification_off_on_insert();

create or replace function public.expire_off_notifications() returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  update notifications set status = 'expired', last_error = '환경설정에서 보내지 않음'
   where status in ('pending', 'failed') and kind not in ('reminder', 'digest') and mail_mode(kind) = 'off';
  get diagnostics v = row_count;
  return v;
end $$;
revoke execute on function public.expire_off_notifications() from public, anon, authenticated;

create or replace function public._notify_settings_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.key = 'notify' then perform expire_off_notifications(); end if;
  return null;
end $$;
drop trigger if exists notify_settings_changed on public.app_settings;
create trigger notify_settings_changed after insert or update on public.app_settings
  for each row execute function public._notify_settings_changed();

-- 지금 대기 중인 것도 정리
select public.expire_off_notifications();
