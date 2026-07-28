alter table public.ai_requests
  add column if not exists latency_ms integer check (latency_ms >= 0);
