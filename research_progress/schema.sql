create table if not exists research_progress (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  student_name text not null,
  student_level text,
  research_direction text,
  period text,
  project_title text,
  advisor text,
  completed_work text,
  key_results text,
  blockers text,
  next_plan text,
  status text,
  attachment_url text,
  notes text,
  review_status text default '未读',
  feedback text
);

create table if not exists research_profile (
  id bigint primary key default 1,
  name text,
  title text,
  bio text,
  google_scholar text,
  personal_homepage text,
  orcid text,
  email text,
  research_keywords text,
  constraint single_research_profile check (id = 1)
);

insert into research_profile (id, name, title, bio, research_keywords)
values (
  1,
  '杨琬琛',
  '南京航空航天大学微波光子学实验室',
  '主要展示 Google Scholar、个人主页、ORCID 和代表性论文。可在负责人后台修改。',
  '微波光子学；微波毫米波天线；光电信息；智能感知'
)
on conflict (id) do nothing;

create table if not exists research_papers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  authors text,
  journal text,
  year text,
  type text,
  doi text,
  link text,
  keywords text
);

alter table research_progress enable row level security;
alter table research_profile enable row level security;
alter table research_papers enable row level security;

drop policy if exists "research_progress public read" on research_progress;
drop policy if exists "research_progress public insert" on research_progress;
drop policy if exists "research_progress public update" on research_progress;
drop policy if exists "research_progress public delete" on research_progress;
create policy "research_progress public read" on research_progress for select using (true);
create policy "research_progress public insert" on research_progress for insert with check (true);
create policy "research_progress public update" on research_progress for update using (true);
create policy "research_progress public delete" on research_progress for delete using (true);

drop policy if exists "research_profile public read" on research_profile;
drop policy if exists "research_profile public insert" on research_profile;
drop policy if exists "research_profile public update" on research_profile;
create policy "research_profile public read" on research_profile for select using (true);
create policy "research_profile public insert" on research_profile for insert with check (true);
create policy "research_profile public update" on research_profile for update using (true);

drop policy if exists "research_papers public read" on research_papers;
drop policy if exists "research_papers public insert" on research_papers;
drop policy if exists "research_papers public update" on research_papers;
drop policy if exists "research_papers public delete" on research_papers;
create policy "research_papers public read" on research_papers for select using (true);
create policy "research_papers public insert" on research_papers for insert with check (true);
create policy "research_papers public update" on research_papers for update using (true);
create policy "research_papers public delete" on research_papers for delete using (true);
