-- ============================================================
-- Caregiver Support System — Supabase Schema
-- Run this in your Supabase project: SQL Editor → New Query
-- ============================================================

-- Profiles table (extends Supabase auth.users)
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  role        text not null default 'caregiver' check (role in ('caregiver', 'admin', 'psychiatrist')),
  is_escalated          boolean not null default false,
  assigned_psychiatrist uuid references public.profiles(id),
  week_joined timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- Voice conversation sessions
create table public.sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  transcript      jsonb not null default '[]',   -- [{role, content, timestamp}]
  emotion_analysis jsonb not null default '{}',  -- {dominantEmotion, sentimentScore, stressLevel, emotionalIntensity, flags}
  burnout_delta   numeric,
  session_date    timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- Weekly burnout scores (one row per user per week)
create table public.burnout_scores (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  week_number           integer not null,
  week_start_date       timestamptz not null,
  average_sentiment     numeric,
  average_stress        numeric,
  negative_session_ratio numeric,
  fatigue_flags         integer,
  emotional_instability numeric,
  evaluation_score      numeric,
  evaluation_completed  boolean not null default false,
  weekly_burnout_score  numeric not null default 0,
  risk_level            text not null default 'low' check (risk_level in ('low', 'moderate', 'high', 'critical')),
  is_monthly_evaluation boolean not null default false,
  monthly_burnout_score numeric,
  escalation_triggered  boolean not null default false,
  created_at            timestamptz not null default now(),
  unique (user_id, week_number)
);

-- Weekly evaluation questionnaires
create table public.weekly_evaluations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  week_number  integer not null,
  questions    jsonb not null,
  responses    jsonb not null default '[]',  -- [{question, answer, sentimentScore, emotionDetected}]
  overall_score numeric,
  completed_at  timestamptz,
  is_pending   boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ── Row Level Security ────────────────────────────────────────────────────────

alter table public.profiles           enable row level security;
alter table public.sessions           enable row level security;
alter table public.burnout_scores     enable row level security;
alter table public.weekly_evaluations enable row level security;

-- Profiles: users can read their own; admins/psychiatrists can read all
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admins and psychiatrists can read all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'psychiatrist')
    )
  );

-- Sessions: caregivers see own; admins/psychiatrists see all
create policy "Caregivers see own sessions"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "Admins and psychiatrists see all sessions"
  on public.sessions for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'psychiatrist')
    )
  );

-- Burnout scores: caregivers cannot see their own scores (hidden by design)
create policy "Only admins and psychiatrists see burnout scores"
  on public.burnout_scores for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'psychiatrist')
    )
  );

-- Weekly evaluations: users see own pending evals
create policy "Users see own evaluations"
  on public.weekly_evaluations for select
  using (auth.uid() = user_id);

create policy "Admins and psychiatrists see all evaluations"
  on public.weekly_evaluations for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'psychiatrist')
    )
  );

-- ── Auto-create profile on signup ────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'User'),
    coalesce(new.raw_user_meta_data->>'role', 'caregiver')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
