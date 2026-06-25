# Analytics setup

The Mini App is static on GitHub Pages. Central analytics requires a backend endpoint.

## Supabase setup

Project:

```text
https://supabase.com/dashboard/project/jfyprwisnrubhhowipdm
```

Deployed endpoints:

```text
https://jfyprwisnrubhhowipdm.functions.supabase.co/analytics-events
https://jfyprwisnrubhhowipdm.functions.supabase.co/telegram-webhook
https://jfyprwisnrubhhowipdm.functions.supabase.co/analytics-dashboard
https://jfyprwisnrubhhowipdm.functions.supabase.co/create-stars-invoice
https://jfyprwisnrubhhowipdm.functions.supabase.co/subscription-status
```

1. Create a Supabase project.
2. Run `supabase/schema.sql` in SQL Editor, or run `supabase db push`.
3. Deploy `supabase/functions/analytics-events`.
4. Deploy `supabase/functions/telegram-webhook`.
5. Deploy `supabase/functions/analytics-dashboard`.
6. Deploy `supabase/functions/create-stars-invoice`.
7. Deploy `supabase/functions/subscription-status`.
8. Copy function URLs into `analytics-config.js`:

```js
window.BABY_ANALYTICS_ENDPOINT = 'https://<project-ref>.functions.supabase.co/analytics-events';
window.BABY_CREATE_STARS_INVOICE_ENDPOINT = 'https://<project-ref>.functions.supabase.co/create-stars-invoice';
window.BABY_SUBSCRIPTION_STATUS_ENDPOINT = 'https://<project-ref>.functions.supabase.co/subscription-status';
```

## Admin dashboard

Static page:

```text
https://arseneleshaevwork-dotcom.github.io/baby-tma/admin.html
```

The page calls `analytics-dashboard` and sends the admin token in the `x-admin-token` header. The token must exist only in Supabase secrets and in a local private note for the project owner.

Set or rotate the token:

```bash
supabase secrets set ADMIN_TOKEN='<strong_random_token>' --project-ref jfyprwisnrubhhowipdm
supabase functions deploy analytics-dashboard --project-ref jfyprwisnrubhhowipdm
```

Do not commit `ADMIN_TOKEN`, service role keys, or Telegram bot tokens to the repository.

## Telegram webhook

To see users who press `/start` but never open the Mini App, set the bot token as a Supabase secret and then register the webhook:

```bash
supabase secrets set TELEGRAM_BOT_TOKEN='<telegram_bot_token>' --project-ref jfyprwisnrubhhowipdm
supabase secrets set TELEGRAM_WEBHOOK_SECRET='<strong_random_webhook_secret>' --project-ref jfyprwisnrubhhowipdm
curl "https://api.telegram.org/bot<telegram_bot_token>/setWebhook?url=https://jfyprwisnrubhhowipdm.functions.supabase.co/telegram-webhook&secret_token=<strong_random_webhook_secret>"
```

Do not commit Telegram bot tokens to the repository.

## Telegram Stars subscriptions

Premium payments use Telegram Stars:

1. The Mini App sends Telegram `initData` and the selected plan to `create-stars-invoice`.
2. The function verifies `initData` with `TELEGRAM_BOT_TOKEN`.
3. The function creates a Telegram Stars invoice link and stores a pending row in `payments`.
4. Telegram sends `successful_payment` to `telegram-webhook`.
5. The webhook updates `payments` and upserts the active row in `subscriptions`.
6. The Mini App calls `subscription-status` to refresh access.

Client-side `localStorage` is treated only as a cache. Paid access must be verified through `subscription-status`.

## Core events

- `app_open`: Mini App opened.
- `onboarding_start`: welcome flow shown.
- `onboarding_complete`: welcome flow completed or skipped.
- `profile_saved`: baby name or birthdate saved.
- `schedule_generated`: day plan generated.
- `sleep_started`: quick sleep timer started.
- `sleep_finished`: quick sleep saved.
- `diary_saved`: full diary day saved.
- `ai_opened`: AI consultant opened.
- `ai_question_sent`: question sent to AI consultant.
- `premium_opened`: Premium page opened.
- `trial_started`: trial activated.
- `subscribe_clicked`: subscription button clicked.

## Useful queries

Funnel for the last 7 days:

```sql
select event_name, count(*) as events, count(distinct coalesce(telegram_id::text, client_id)) as users
from public.events
where created_at >= now() - interval '7 days'
group by event_name
order by events desc;
```

Opened app and did nothing after 60 seconds:

```sql
with first_open as (
  select coalesce(telegram_id::text, client_id) as user_key, min(created_at) as opened_at
  from public.events
  where event_name = 'app_open'
  group by 1
),
activation as (
  select distinct coalesce(telegram_id::text, client_id) as user_key
  from public.events
  where event_name in ('profile_saved', 'schedule_generated', 'ai_opened', 'sleep_started', 'diary_saved')
)
select count(*) as opened_and_left
from first_open f
left join activation a on a.user_key = f.user_key
where a.user_key is null;
```

Babies with upcoming birthdays:

```sql
select
  name,
  birthdate,
  date_part('year', age(now(), birthdate))::int as age_years,
  date_part('month', age(now(), birthdate))::int as extra_months
from public.babies
where birthdate is not null;
```
