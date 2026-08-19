-- search_links 정렬에 id 보조 기준을 더한다.
-- 근거: PRD.md 5번 2)("검색 결과 역시 최신순으로 20개씩 더 보기로 가져온다")
--
-- 같은 순간에 저장된 링크는 created_at이 같아 순서가 흔들린다.
-- 그러면 "더 보기"로 다음 20개를 가져올 때 어떤 링크는 빠지고 어떤 링크는 겹친다.
-- 목록 조회(lib/db.ts)가 이미 id로 한 번 더 정렬하고 있으므로 검색도 같게 맞춘다.
--
-- 함수의 인자와 반환 모양은 그대로다. order by 한 줄만 바뀐다.

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
  order by created_at desc, id desc
  limit  p_limit
  offset p_offset;
$$;
