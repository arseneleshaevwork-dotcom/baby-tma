# Security checklist

## Done in code

- Premium can no longer be activated by the subscribe button in the client.
- Telegram Stars invoices are created only by `create-stars-invoice`.
- `create-stars-invoice` verifies Telegram Mini App `initData`; `subscription-status` accepts either verified Telegram authentication or a hashed guest billing key.
- `telegram-webhook` requires `TELEGRAM_WEBHOOK_SECRET` and fails closed when it is missing.
- Pre-checkout payments are accepted only when the invoice payload exists in `payments`, belongs to the same Telegram user, and matches currency/amount.
- Successful payments activate Premium only when the invoice payload is a valid project payload for that Telegram user.
- `subscriptions` and `payments` have RLS enabled and are intended to be accessed through service-role Edge Functions only.
- The current tree contains no bot token, service-role key, Supabase access token or admin token. An obsolete Telegram bot token is still present in five early public Git commits and must be rotated before launch; rewriting history comes only after rotation and coordination with every active clone.
- Admin endpoints use constant-time token comparison and no longer accept the access token in the query string.
- Analytics accepts only known event names, rate-limits ingestion, restricts browser origins, and stores child data only for verified Telegram sessions.
- Public analytics applies independent per-IP and per-device limits, rejects claimed Telegram IDs from guest events and validates child dates and age before storage.
- Payment charge IDs are unique, so Telegram retries and recurring renewals cannot activate access twice.
- Reminder jobs are claimed atomically and tolerate a delayed scheduler without duplicate delivery.
- Website login verifies Telegram's signed OIDC token, issuer, audience, nonce and expiry before creating an opaque server session.
- Web sessions and login nonces expire, can be revoked, are rate-limited and are never exposed in database policies.
- Synced profile, diary and settings tables use RLS and are available only through an authenticated Edge Function.
- YooKassa notifications are treated as untrusted hints: the function retrieves the payment or refund from YooKassa before changing access.
- Refund processing additionally requires the provider refund object itself to have the `succeeded` status.
- YooKassa amounts, currency, owner and internal payment ID are checked server-side; requests and events are idempotent.
- Saved payment-method identifiers are encrypted with `BILLING_ENCRYPTION_KEY`; card details are redacted from stored payloads.
- Guest web checkout uses a 256-bit random browser key, stores only its SHA-256 hash, never puts it in the URL, requires an approved browser origin and applies both fingerprint and billing-identity rate limits.
- Full refunds remove only the period added by that payment; an earlier paid period remains active. Partial refunds do not remove the entire paid period.
- Browser CORS is restricted to production origins and approved local development origins.
- Synced schedules are validated as structured data and escaped before HTML rendering.
- AI daily limits are claimed atomically in PostgreSQL, so parallel requests cannot bypass the free or Premium cap.
- Third-party jsDelivr scripts use pinned versions and Subresource Integrity; static pages apply restrictive Content Security Policy rules.
- Supabase Edge Functions pin `@supabase/supabase-js` to `2.112.3` instead of floating on the latest `2.x` release.
- The Baby Agent accepts a model provider only on loopback, rejects unsafe model output and has a useful knowledge fallback.
- Admin, cron, Telegram webhook and Baby Agent shared secrets fail closed when configured shorter than 32 characters.

## Required before paid traffic

- Keep all Supabase and GitHub Actions secrets outside the repository and rotate them after accidental exposure.
- Review failed payments, failed reminders and AI error rate in the admin dashboard before each advertising increase.
- Run a real Stars purchase and renewal test from a Telegram test account before paid traffic.
- Run real YooKassa card and SBP purchases plus full/partial refund tests before paid traffic. Web renewal/cancellation tests apply only after recurrent payments are enabled.
- Test guest checkout return, access recovery on the purchasing browser and support recovery when that browser storage is lost.
- Add the seller's legal name, tax details, support contact, refund rules and receipt configuration before accepting RUB payments.
- Rotate the Telegram bot token and Supabase personal access token that were previously pasted into a chat, then update deployment secrets and the webhook. After every active clone has moved to the new token, rewrite the public Git history to remove the obsolete bot token and force-push in a coordinated maintenance window.
- Register the production website in Telegram Login allowed URLs and keep `TELEGRAM_LOGIN_CLIENT_ID` equal to the bot ID.
- Configure YooKassa HTTP notifications for `payment.succeeded`, `payment.canceled` and `refund.succeeded`.
- Verify backup restoration and VPS service restart after each infrastructure change.
