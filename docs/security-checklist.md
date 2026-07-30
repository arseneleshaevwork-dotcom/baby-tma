# Security checklist

## Done in code

- Premium can no longer be activated by the subscribe button in the client.
- Telegram Stars invoices are created only by `create-stars-invoice`.
- `create-stars-invoice` and `subscription-status` verify Telegram Mini App `initData`.
- `telegram-webhook` requires `TELEGRAM_WEBHOOK_SECRET` and fails closed when it is missing.
- Pre-checkout payments are accepted only when the invoice payload exists in `payments`, belongs to the same Telegram user, and matches currency/amount.
- Successful payments activate Premium only when the invoice payload is a valid project payload for that Telegram user.
- `subscriptions` and `payments` have RLS enabled and are intended to be accessed through service-role Edge Functions only.
- No bot token, service-role key, Supabase access token, or admin token is committed to the repository.
- Admin endpoints use constant-time token comparison and no longer accept the access token in the query string.
- Analytics accepts only known event names, rate-limits ingestion, restricts browser origins, and stores child data only for verified Telegram sessions.
- Payment charge IDs are unique, so Telegram retries and recurring renewals cannot activate access twice.
- Reminder jobs are claimed atomically and tolerate a delayed scheduler without duplicate delivery.

## Required before paid traffic

- Keep all Supabase and GitHub Actions secrets outside the repository and rotate them after accidental exposure.
- Review failed payments, failed reminders and AI error rate in the admin dashboard before each advertising increase.
- Run a real Stars purchase and renewal test from a Telegram test account before paid traffic.
- Verify backup restoration and VPS service restart after each infrastructure change.
