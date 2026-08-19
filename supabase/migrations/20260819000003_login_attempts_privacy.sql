-- 접속자 구분 값을 IP 대신 되돌릴 수 없는 값으로 바꾸고, 오래된 기록을 지운다.
-- 근거: PRD.md 7번(개인정보), 9번(예외 테이블), 배포 전 보안 점검 Medium
--
-- 왜 필요한가
--   IP는 다른 정보와 합치면 개인을 알아볼 수 있어 통상 개인정보로 다룬다.
--   그런데 PRD.md는 "개인정보를 수집하지 않는다"고 적고 있어 실제와 어긋났다.
--   또 비밀번호를 맞힌 접속자의 기록만 지워져서, 틀린 채로 떠난 기록은 영영 남았다.
--
-- 무엇을 바꾸나
--   1) ip 칼럼 이름을 ip_hash로 바꾼다. 앱이 IP 대신 변환한 값을 넣는다.
--      (칼럼 이름이 ip인 채로 다른 값을 넣으면 나중에 읽는 사람이 오해한다)
--   2) 실패를 기록할 때 오래된 기록을 함께 지운다.
--      따로 예약 작업을 두지 않아도 되고, 표가 작아 비용도 들지 않는다.

alter table public.login_attempts rename column ip to ip_hash;

-- 인자가 하나 늘어 이름만으로는 구분되지 않으므로 옛 함수를 먼저 지운다.
drop function if exists public.record_failure(text, integer, integer);

create or replace function public.record_failure(
  p_ip_hash        text,
  p_max_attempts   integer,
  p_block_seconds  integer,
  p_retention_days integer
)
returns timestamptz
language plpgsql
set search_path = public
as $$
declare
  v_fail_count    integer;
  v_blocked_until timestamptz;
begin
  -- 오래된 기록을 지운다. 다만 아직 차단 중인 기록은 남긴다.
  delete from public.login_attempts
   where last_failed_at < now() - make_interval(days => p_retention_days)
     and (blocked_until is null or blocked_until < now());

  -- 없으면 1로 만들고, 있으면 1을 더한다. 같은 값에 대해 차례로 처리된다.
  insert into public.login_attempts (ip_hash, fail_count, last_failed_at)
  values (p_ip_hash, 1, now())
  on conflict (ip_hash) do update
    set fail_count     = login_attempts.fail_count + 1,
        last_failed_at = now()
  returning fail_count into v_fail_count;

  -- 정해진 횟수에 닿으면 차단하고, 횟수는 다시 0부터 센다.
  if v_fail_count >= p_max_attempts then
    update public.login_attempts
       set fail_count    = 0,
           blocked_until = now() + make_interval(secs => p_block_seconds)
     where ip_hash = p_ip_hash
    returning blocked_until into v_blocked_until;
  end if;

  return v_blocked_until;
end;
$$;
