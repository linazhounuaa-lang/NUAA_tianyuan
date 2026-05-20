create table if not exists recommendations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  recommender text not null,
  theme text not null,
  expert_name text not null,
  expert_affiliation text not null,
  expert_title text,
  expert_field text not null,
  category text,
  talk_title text,
  contact_basis text not null,
  can_help_invite text not null,
  suggested_quarter text,
  reason text not null,
  notes text,
  priority text,
  invite_status text default '待确认',
  leader_decision text default '待定',
  leader_comment text
);

create table if not exists current_workshop (
  id bigint primary key default 1,
  issue text,
  theme text,
  expert_name text,
  expert_affiliation text,
  expert_title text,
  expert_field text,
  talk_title text,
  event_time text,
  location text,
  host text,
  leader text,
  internal_speaker text,
  contact_person text,
  expert_bio text,
  abstract text,
  constraint single_current_workshop check (id = 1)
);

insert into current_workshop (id, issue)
values (1, '2026年第1期')
on conflict (id) do nothing;

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  issue text,
  event_time text,
  theme text,
  expert_name text,
  expert_affiliation text,
  expert_title text,
  expert_field text,
  talk_title text,
  location text,
  host text,
  contact_person text,
  attendee_count integer,
  news_status text,
  cooperation_intent text,
  follow_up text,
  report_image text,
  notes text
);

alter table recommendations enable row level security;
alter table current_workshop enable row level security;
alter table events enable row level security;

drop policy if exists "recommendations public read" on recommendations;
drop policy if exists "recommendations public insert" on recommendations;
drop policy if exists "recommendations public update" on recommendations;
drop policy if exists "recommendations public delete" on recommendations;
create policy "recommendations public read" on recommendations for select using (true);
create policy "recommendations public insert" on recommendations for insert with check (true);
create policy "recommendations public update" on recommendations for update using (true);
create policy "recommendations public delete" on recommendations for delete using (true);

drop policy if exists "current_workshop public read" on current_workshop;
drop policy if exists "current_workshop public insert" on current_workshop;
drop policy if exists "current_workshop public update" on current_workshop;
create policy "current_workshop public read" on current_workshop for select using (true);
create policy "current_workshop public insert" on current_workshop for insert with check (true);
create policy "current_workshop public update" on current_workshop for update using (true);

drop policy if exists "events public read" on events;
drop policy if exists "events public insert" on events;
drop policy if exists "events public update" on events;
drop policy if exists "events public delete" on events;
create policy "events public read" on events for select using (true);
create policy "events public insert" on events for insert with check (true);
create policy "events public update" on events for update using (true);
create policy "events public delete" on events for delete using (true);
