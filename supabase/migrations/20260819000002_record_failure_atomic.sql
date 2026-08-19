-- 비밀번호 실패 횟수를 원자적으로 올린다.
-- 근거: PRD.md 5번 1)(5회 연속 실패 시 10분 차단), 보안 점검 Critical 1번
--
-- 왜 필요한가
--   지금까지는 앱이 fail_count를 읽고 → 1을 더해 → 다시 쓰는 방식이었다.
--   요청이 동시에 여러 개 오면 전부 같은 값을 읽어 전부 같은 값을 쓴다.
--   그래서 30번을 한꺼번에 틀려도 횟수는 1~4밖에 오르지 않고 차단이 발동하지 않았다.
--
--   이 함수는 한 줄에 대한 잠금 안에서 증가와 차단 판단을 함께 처리하므로,
--   요청이 동시에 와도 하나씩 차례로 세어진다.
--
-- 숫자를 SQL에 박지 않고 인자로 받는 이유
--   5회와 10분은 lib/constants.ts가 관리하는 값이다. (CLAUDE.md 규칙)
--   여기 또 적으면 두 곳이 어긋난다.
--
-- 돌려주는 값: 차단 해제 시각. 이번 실패로 차단되지 않았으면 null.

create or replace function public.record_failure(
  p_ip            text,
  p_max_attempts  integer,
  p_block_seconds integer
)
returns timestamptz
language plpgsql
set search_path = public
as $$
declare
  v_fail_count    integer;
  v_blocked_until timestamptz;
begin
  -- 없으면 1로 만들고, 있으면 1을 더한다. 같은 ip 행에 대해 차례로 처리된다.
  insert into public.login_attempts (ip, fail_count, last_failed_at)
  values (p_ip, 1, now())
  on conflict (ip) do update
    set fail_count     = login_attempts.fail_count + 1,
        last_failed_at = now()
  returning fail_count into v_fail_count;

  -- 정해진 횟수에 닿으면 차단하고, 횟수는 다시 0부터 센다.
  if v_fail_count >= p_max_attempts then
    update public.login_attempts
       set fail_count    = 0,
           blocked_until = now() + make_interval(secs => p_block_seconds)
     where ip = p_ip
    returning blocked_until into v_blocked_until;
  end if;

  return v_blocked_until;
end;
$$;
