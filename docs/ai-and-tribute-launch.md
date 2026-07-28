# AI and Tribute launch checklist

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

## Tribute products

Create two offers:

- Monthly: recurring access, the base displayed price.
- Six months: one-time or recurring only if Tribute supports the required renewal flow; target a 20% discount versus six monthly payments.

The Mini App must show one paywall with both periods, the exact renewal terms, price, cancellation path and a restore/check-status command. Access is activated from a verified Tribute webhook, never from a browser redirect alone.

Required server secrets:

- `TRIBUTE_API_KEY`
- `TRIBUTE_WEBHOOK_SECRET`
- product identifiers for monthly and six-month offers

Webhook acceptance rules:

- verify Tribute's documented HMAC signature against the exact raw request body;
- reject stale or duplicate events;
- map access by verified Telegram ID;
- store the external event/payment ID for idempotency;
- activate only paid/active events and revoke only on an explicit expired/refunded/cancelled state;
- keep raw payloads private and redact them from logs.

Do not replace Telegram Stars checkout until the Tribute products, webhook replay tests, refund flow and Mini App policy compliance are verified in production.

## Partner program

Start with one channel-specific partner link per promoter, 20% commission for six months, and no overlapping native Telegram affiliate commission. Track partner/source, clicks, app opens, completed profiles, trial starts, paid conversions, refunds and net revenue in the admin dashboard. Pay only from verified Tribute conversions after the refund window.

## Launch gates

- Safety test set passes, including urgent symptoms and prompt injection.
- No raw question, diary note, child name or Telegram ID appears in Baby Agent logs.
- Agent failure returns a useful fallback in the Mini App.
- p95 response time and error rate are visible in admin analytics.
- Backup, swap, service restart and rollback have been tested.
- Tribute webhook, cancellation, refund and duplicate-event tests pass before paid traffic.
