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
- Website login verifies Telegram's signed OIDC token, issuer, audience, nonce and expiry before creating an opaque server session.
- Web sessions and login nonces expire, can be revoked, are rate-limited and are never exposed in database policies.
- Synced profile, diary and settings tables use RLS and are available only through an authenticated Edge Function.
- YooKassa notifications are treated as untrusted hints: the function retrieves the payment or refund from YooKassa before changing access.
- YooKassa amounts, currency, owner and internal payment ID are checked server-side; requests and events are idempotent.
- Saved payment-method identifiers are encrypted with `BILLING_ENCRYPTION_KEY`; card details are redacted from stored payloads.
- Full refunds revoke web Premium; partial refunds do not accidentally remove the entire paid period.
- Browser CORS is restricted to production origins and approved local development origins.

## Required before paid traffic

- Keep all Supabase and GitHub Actions secrets outside the repository and rotate them after accidental exposure.
- Review failed payments, failed reminders and AI error rate in the admin dashboard before each advertising increase.
- Run a real Stars purchase and renewal test from a Telegram test account before paid traffic.
- Run real YooKassa card and SBP purchases, cancellation, renewal failure and full/partial refund tests before paid traffic.
- Add the seller's legal name, tax details, support contact, refund rules and receipt configuration before accepting RUB payments.
- Rotate the Telegram bot token and Supabase personal access token that were previously pasted into a chat, then update deployment secrets and the webhook.
- Register the production website in Telegram Login allowed URLs and keep `TELEGRAM_LOGIN_CLIENT_ID` equal to the bot ID.
- Configure YooKassa HTTP notifications for `payment.succeeded`, `payment.canceled` and `refund.succeeded`.
- Verify backup restoration and VPS service restart after each infrastructure change.
