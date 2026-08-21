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
4. Set `BABY_AGENT_PROVIDER_URL` to the loopback proxy (for example `http://127.0.0.1:8645`), plus `BABY_AGENT_PROVIDER_MODEL` and, if required, `BABY_AGENT_PROVIDER_KEY` in `/etc/baby-agent.env`.
5. Restart `baby-agent.service`, confirm `/health` reports `provider_configured: true`, then test safety, diary and provider-failure fallback.
6. Watch p95 latency, failures and answer feedback in the admin dashboard for at least one week before raising limits.

## Subscription decision

The launch uses one Premium entitlement with two compliant checkout paths:

- Inside the Telegram bot and Mini App: Telegram Stars, plus an explicit "Card / SBP" handoff to the independent web app and YooKassa checkout.
- On the independent website/PWA: YooKassa checkout with cards and SBP.

The offers are:

- Web monthly: one-time 349 RUB for one month; renewal is manual.
- Web quarter: one-time 899 RUB for three months; renewal is manual.
- Telegram monthly: 299 Stars, recurring every 30 days.
- Telegram quarter: 769 Stars, one-time access for 90 days.

The quarter offer in Stars is intentionally one-time because Telegram recurring subscriptions currently use a 30-day period. The UI states renewal terms before checkout. A user who signs into the website with Telegram receives the same profile, diary, settings and Premium entitlement on both surfaces.

Tribute and Lava remain outside the launch payment path. They add another entitlement source without improving the main customer journey. YooKassa is the primary web provider because the checkout supports Russian cards and SBP while the product keeps control of customer identity, receipts and support. Web autorenewal remains disabled until YooKassa explicitly allows recurrent payments for the shop.

Payment acceptance rules:

- require Telegram webhook secret validation;
- reject duplicate charge IDs;
- map access by verified Telegram ID;
- verify invoice owner, currency and amount before checkout;
- activate only successful Telegram payment updates;
- keep raw payloads private and redact them from logs.
- verify each YooKassa webhook by fetching the payment or refund from YooKassa API;
- use idempotence keys for every YooKassa payment;
- do not save a YooKassa payment method while recurrent payments are disabled;
- restore only the access period added by a fully refunded payment;
- keep failed payments and webhook errors visible in admin.

## Partner program

Partner experiments remain deferred. Attribution by `start_param` and UTM stays enabled so future promoters can be measured without changing the app.

## Launch gates

- Safety test set passes, including urgent symptoms and prompt injection.
- No raw question, diary note, child name or Telegram ID appears in Baby Agent logs.
- Agent failure returns a useful fallback in the Mini App.
- p95 response time and error rate are visible in admin analytics.
- Backup, swap, service restart and rollback have been tested.
- Stars purchase/renewal and YooKassa purchase/refund/duplicate-event tests pass before paid traffic.
