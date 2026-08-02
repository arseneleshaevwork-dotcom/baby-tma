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
https://jfyprwisnrubhhowipdm.functions.supabase.co/web-auth
https://jfyprwisnrubhhowipdm.functions.supabase.co/sync-data
https://jfyprwisnrubhhowipdm.functions.supabase.co/create-yookassa-payment
https://jfyprwisnrubhhowipdm.functions.supabase.co/yookassa-webhook
https://jfyprwisnrubhhowipdm.functions.supabase.co/yookassa-renewals
https://jfyprwisnrubhhowipdm.functions.supabase.co/billing-subscription
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

The committed production config also contains the web login, sync and YooKassa endpoints. The public Telegram client ID is the numeric bot ID, not the bot token.

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

## Baby Agent

The AI function verifies Telegram `initData`, applies consent and daily limits, then calls the isolated Baby Agent over a signed server-to-server request. Do not put the shared secret in frontend files.

```bash
supabase secrets set \
  BABY_AGENT_URL='https://<agent-host>/baby-agent/v1/answer' \
  BABY_AGENT_SHARED_SECRET='<same-64-char-secret-as-agent>' \
  --project-ref jfyprwisnrubhhowipdm
supabase functions deploy ai-assistant --project-ref jfyprwisnrubhhowipdm
```

The application sends only age and the approved 14-day sleep fields. Raw questions and diary rows are not stored in `ai_requests`; the table contains operational metadata and optional `helpful` / `not_helpful` feedback only.

## Telegram Stars subscriptions

Premium payments use Telegram Stars:

1. The Mini App sends Telegram `initData` and the selected plan to `create-stars-invoice`.
2. The function verifies `initData` with `TELEGRAM_BOT_TOKEN`.
3. The function creates a Telegram Stars invoice link and stores a pending row in `payments`.
4. Telegram sends `successful_payment` to `telegram-webhook`.
5. The webhook updates `payments` and upserts the active row in `subscriptions`.
6. The Mini App calls `subscription-status` to refresh access.

Client-side `localStorage` is treated only as a cache. Paid access must be verified through `subscription-status`.

## Website login, sync and YooKassa

The standalone site signs users in through Telegram Login, creates an opaque web session, and synchronizes profile, diary and settings by verified Telegram ID. Set these secrets before enabling web checkout:

```bash
supabase secrets set \
  TELEGRAM_LOGIN_CLIENT_ID='8999375510' \
  YOOKASSA_SHOP_ID='<shop_id>' \
  YOOKASSA_SECRET_KEY='<secret_key>' \
  BILLING_ENCRYPTION_KEY='<random_secret_at_least_32_chars>' \
  WEB_APP_URL='https://arseneleshaevwork-dotcom.github.io/baby-tma/' \
  APP_ORIGINS='https://arseneleshaevwork-dotcom.github.io' \
  --project-ref jfyprwisnrubhhowipdm
```

In YooKassa configure the notification URL:

```text
https://jfyprwisnrubhhowipdm.functions.supabase.co/yookassa-webhook
```

Enable events `payment.succeeded`, `payment.canceled` and `refund.succeeded`. The first successful checkout saves the provider payment-method identifier; hourly Supabase cron renews active agreements when due. The user can disable or resume renewal from the Premium page without losing the already-paid period.

Before production, register `https://arseneleshaevwork-dotcom.github.io` and the Baby TMA page in the bot's Telegram Login allowed URLs, and complete YooKassa receipt and legal seller settings.

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
