alter table public.knowledge
  add column if not exists priority integer not null default 0,
  add column if not exists verified boolean not null default false,
  add column if not exists source text not null default 'manual';

alter table public.knowledge
  drop constraint if exists knowledge_priority_range;

alter table public.knowledge
  add constraint knowledge_priority_range
  check (priority >= 0 and priority <= 100);

create index if not exists knowledge_verified_priority_idx
  on public.knowledge (verified desc, priority desc);
