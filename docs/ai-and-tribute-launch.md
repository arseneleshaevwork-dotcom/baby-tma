# AI and subscription launch checklist

## Current AI pilot

- Browser sends Telegram `initData`, explicit consent, question, age and an approved 14-day diary slice to Supabase.
- Supabase verifies Telegram, enforces 4 free or 40 premium questions per UTC day and stores metadata only.
- Supabase signs the sanitized request with HMAC and sends it to the isolated Baby Agent.
- Baby Agent runs urgent-symptom routing before model use, summarizes the diary and retrieves vetted knowledge.
- If the optional model provider is unavailable, the parent still receives a knowledge-base answer.
- The public product never receives personal Hermes memory, files, tools or OAuth credentials.

Pilot capacity target: up to 500 registered users, 30-100 daily active users and 100-300 questions per day. Keep the model concurrency at 3 until latency and error-rate data support increasing it.

## Enable a free model

1. Create a separate Nous Portal/Hermes identity for the product. Do not reuse the personal assistant profile.
2. Authorize that identity on the VPS under a separate Linux account.
3. Run its OpenAI-compatible API on localhost only, with terminal, filesystem, browser, memory and messaging tools disabled.
4. Set `BABY_AGENT_PROVIDER_URL`, `BABY_AGENT_PROVIDER_MODEL` and, if required, `BABY_AGENT_PROVIDER_KEY` in `/etc/baby-agent.env`.
5. Restart `baby-agent.service`, confirm `/health` reports `provider_configured: true`, then test safety, diary and provider-failure fallback.
6. Watch p95 latency, failures and answer feedback in the admin dashboard for at least one week before raising limits.

## Subscription decision

Digital Premium access sold inside the Telegram bot or Mini App uses Telegram Stars. This is the Telegram-compliant checkout and does not require a separate YooKassa, YooMoney, Tribute or Lava checkout inside the Mini App.

The product has two offers:

- Monthly: 299 Stars, recurring every 30 days.
- Six months: 1490 Stars, one-time access for 180 days.

The Mini App shows both periods, exact renewal terms and the access end date. Access is activated only from Telegram's verified payment update. Every recurring charge is stored as a separate payment and is idempotent by Telegram charge ID.

YooKassa can be evaluated later for a separate public website. It must not replace Stars for digital access sold inside Telegram. Tribute and Lava are not part of the launch payment path.

Payment acceptance rules:

- require Telegram webhook secret validation;
- reject duplicate charge IDs;
- map access by verified Telegram ID;
- verify invoice owner, currency and amount before checkout;
- activate only successful Telegram payment updates;
- keep raw payloads private and redact them from logs.

## Partner program

Partner experiments remain deferred. Attribution by `start_param` and UTM stays enabled so future promoters can be measured without changing the app.

## Launch gates

- Safety test set passes, including urgent symptoms and prompt injection.
- No raw question, diary note, child name or Telegram ID appears in Baby Agent logs.
- Agent failure returns a useful fallback in the Mini App.
- p95 response time and error rate are visible in admin analytics.
- Backup, swap, service restart and rollback have been tested.
- Stars purchase, recurring renewal and duplicate-event tests pass before paid traffic.
