-- =====================================================================
-- 지시사항 · 코멘트 수정 / 삭제
--   쓴 사람 본인 또는 관리자만 · 고친 시각 표시(updated_at)
--   처리 이력(finding_events)에 '코멘트 수정' / '코멘트 삭제' 와 이전 내용(앞 200자)을 남김
--   수정은 알림을 다시 보내지 않음 (등록 때만)
-- =====================================================================

alter table public.finding_comments add column if not exists updated_at timestamptz;

create or replace function public.edit_comment(p_comment uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare c finding_comments;
begin
  select * into c from finding_comments where id = p_comment for update;
  if not found then raise exception '코멘트를 찾을 수 없습니다.'; end if;
  if not (c.user_id = auth.uid() or is_admin()) then raise exception '쓴 사람 본인이나 관리자만 고칠 수 있습니다.'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception '내용을 입력해 주세요.'; end if;
  if trim(p_body) = c.body then return; end if;
  update finding_comments set body = trim(p_body), updated_at = now() where id = p_comment;
  perform log_event(c.finding_id, '코멘트 수정', '이전 : ' || left(c.body, 200));
end $$;

create or replace function public.delete_comment(p_comment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c finding_comments;
begin
  select * into c from finding_comments where id = p_comment for update;
  if not found then raise exception '코멘트를 찾을 수 없습니다.'; end if;
  if not (c.user_id = auth.uid() or is_admin()) then raise exception '쓴 사람 본인이나 관리자만 지울 수 있습니다.'; end if;
  delete from finding_comments where id = p_comment;
  perform log_event(c.finding_id, '코멘트 삭제', case when c.is_directive then '[지시] ' else '' end || left(c.body, 200));
end $$;
