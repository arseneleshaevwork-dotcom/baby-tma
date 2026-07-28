alter table public.ai_requests
  add column if not exists mode text,
  add column if not exists feedback text check (feedback in ('helpful', 'not_helpful')),
  add column if not exists feedback_at timestamptz;

create index if not exists ai_requests_feedback_created_idx
  on public.ai_requests (feedback, created_at desc)
  where feedback is not null;
