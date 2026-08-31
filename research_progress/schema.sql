create table if not exists research_progress (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  student_name text not null,
  student_level text,
  research_direction text,
  period text,
  report_date date,
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

insert into research_profile (id, name, title, bio, google_scholar, email, research_keywords)
values (
  1,
  '周莉娜',
  '南京航空航天大学微波光子学实验室 副教授',
  '周莉娜博士主要从事光子学与光学成像研究，研究方向包括单像素成像、鬼成像、散射介质成像、信息光子学、光学加密与认证，以及人工智能赋能的光子学系统。现任南京航空航天大学副教授，承担本科生《数字逻辑电路》和博士生《非线性光学》等课程。',
  'https://scholar.google.com/citations?user=HYJKgg4AAAAJ&hl=en&oi=ao',
  'linazhou@polyu.edu.hk',
  '光学成像；单像素成像；鬼成像；散射介质成像；信息光子学；光学加密；AI for Photonics'
)
on conflict (id) do update set
  name = excluded.name,
  title = excluded.title,
  bio = excluded.bio,
  google_scholar = excluded.google_scholar,
  email = excluded.email,
  research_keywords = excluded.research_keywords;

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

alter table research_progress add column if not exists report_date date;

create table if not exists research_projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  role text,
  title text not null,
  period text,
  funding text,
  status text,
  description text
);

alter table research_progress enable row level security;
alter table research_profile enable row level security;
alter table research_papers enable row level security;
alter table research_projects enable row level security;

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

drop policy if exists "research_projects public read" on research_projects;
drop policy if exists "research_projects public insert" on research_projects;
drop policy if exists "research_projects public update" on research_projects;
drop policy if exists "research_projects public delete" on research_projects;
create policy "research_projects public read" on research_projects for select using (true);
create policy "research_projects public insert" on research_projects for insert with check (true);
create policy "research_projects public update" on research_projects for update using (true);
create policy "research_projects public delete" on research_projects for delete using (true);
