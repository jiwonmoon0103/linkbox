-- linkbox 초기 DB 구조
-- 근거: DESIGN.md 7번 데이터 모델, PRD.md 9번 데이터 구조

-- 1) 링크 보관 테이블
create table if not exists public.links (
  id          bigint generated always as identity primary key,
  -- 정규화한 주소. 같은 링크를 두 번 저장하지 못하게 고유값으로 둔다.
  url         text        not null unique,
  title       text        not null default '',
  -- 3줄 요약, 또는 "요약 실패" / "요약 없음(본문이 짧은 페이지)"
  summary     text        not null default '',
  -- 태그는 쉼표 문자열이 아니라 목록(text 배열). AI를 호출하지 않은 경우 빈 배열.
  tags        text[]      not null default '{}',
  created_at  timestamptz not null default now()
);

-- 목록은 항상 최신순이므로 저장 시각에 인덱스를 둔다.
create index if not exists links_created_at_idx on public.links (created_at desc);

-- 2) 비밀번호 실패 기록 테이블 (5회 실패 시 10분 차단용)
-- 링크 데이터와 무관하며 사용자 계정 정보는 담지 않는다.
create table if not exists public.login_attempts (
  ip             text        primary key,
  fail_count     integer     not null default 0,
  last_failed_at timestamptz,
  blocked_until  timestamptz
);

-- 3) 행 수준 보안(RLS)을 켠다.
-- 정책을 만들지 않으므로 일반 키로는 아무것도 읽고 쓸 수 없고,
-- 서버 전용 키(service_role)로만 접근할 수 있다.
alter table public.links          enable row level security;
alter table public.login_attempts enable row level security;

-- 4) 검색 함수
-- tags가 배열이라 ILIKE를 직접 걸 수 없어 함수로 처리한다.
-- p_q  : 검색어 (제목, 요약, 태그를 함께 뒤진다. 대소문자 구분 없음)
-- p_tag: 태그 필터 (정확히 일치하는 태그만)
-- 검색어와 태그가 함께 오면 두 조건을 모두 만족하는 것만 남긴다(AND).
create or replace function public.search_links(
  p_q      text    default null,
  p_tag    text    default null,
  p_limit  integer default 20,
  p_offset integer default 0
)
returns setof public.links
language sql
stable
set search_path = public
as $$
  select *
  from public.links
  where
    (
      p_q is null or p_q = ''
      or title   ilike '%' || p_q || '%'
      or summary ilike '%' || p_q || '%'
      or exists (select 1 from unnest(tags) as t where t ilike '%' || p_q || '%')
    )
    and (
      p_tag is null or p_tag = ''
      or p_tag = any (tags)
    )
  order by created_at desc
  limit  p_limit
  offset p_offset;
$$;
