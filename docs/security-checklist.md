# Security checklist

## Done in code

- Premium can no longer be activated by the subscribe button in the client.
- Telegram Stars invoices are created only by `create-stars-invoice`.
- `create-stars-invoice` and `subscription-status` verify Telegram Mini App `initData`.
- `telegram-webhook` supports `TELEGRAM_WEBHOOK_SECRET` and validates the Telegram secret header when the secret is configured.
- Pre-checkout payments are accepted only when the invoice payload exists in `payments`, belongs to the same Telegram user, and matches currency/amount.
- Successful payments activate Premium only when the invoice payload is a valid project payload for that Telegram user.
- `subscriptions` and `payments` have RLS enabled and are intended to be accessed through service-role Edge Functions only.
- No bot token, service-role key, Supabase access token, or admin token is committed to the repository.

## Required before paid traffic

- Set `TELEGRAM_WEBHOOK_SECRET` in Supabase secrets.
- Re-register the Telegram webhook with `secret_token`.
- Deploy `create-stars-invoice`, `subscription-status`, and the updated `telegram-webhook`.
- Apply the `20260625010000_subscriptions.sql` migration.
- Move paid server-cost features, especially AI usage, behind backend entitlement checks. Client-side gates are UX only and must not protect paid API cost by themselves.
- Add admin dashboard sections for payments, active subscriptions, failed invoices, and daily AI usage.
