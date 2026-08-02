# Web payments launch runbook

## Customer flow

1. The customer opens the standalone website or installs it as a PWA.
2. Telegram Login links the browser to the same Telegram ID used in the Mini App.
3. The Premium page offers 349 RUB per month or 899 RUB per three months.
4. After explicit subscription and recurring-payment consent, YooKassa opens its hosted checkout with the methods enabled for the shop, including cards and SBP where available.
5. The browser returns to `index.html?payment=return`, but access changes only after the verified YooKassa notification is processed.
6. The app refreshes subscription status and syncs profile, diary and settings across web and Telegram.

Inside Telegram the checkout remains Stars-only: 299 Stars monthly or 769 Stars for a one-time 90-day period.

## Production setup

- Run the latest Supabase migrations.
- Set `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `BILLING_ENCRYPTION_KEY`, `TELEGRAM_LOGIN_CLIENT_ID`, `WEB_APP_URL` and `APP_ORIGINS` as Supabase secrets.
- Register the website in Telegram Login allowed URLs.
- Register the YooKassa notification endpoint and required events.
- Ask YooKassa to confirm saved payment methods and recurrent payments are enabled for the shop.
- Configure receipts, tax system, VAT code, seller identity, offer/refund terms and support details.
- Deploy all functions listed in `supabase/config.toml`.
- Use the admin dashboard to confirm payment, agreement, webhook and renewal records.

## Acceptance tests

- Monthly card checkout grants Premium on both web and Mini App.
- Quarterly SBP checkout grants Premium on both surfaces and sets the correct next charge date.
- A repeated webhook does not extend access twice.
- Cancelling renewal preserves access until the paid end date; resuming restores the scheduled charge.
- A failed renewal enters `past_due`, retries with backoff and remains visible in admin.
- A full refund revokes the web entitlement; a partial refund does not revoke the whole paid period.
- Logout revokes the web session and another browser cannot reuse it after revocation.
- Diary edits made on web appear in the Mini App and conflicts keep the newest timestamp.

Do not enable the web payment buttons for advertising traffic until YooKassa production credentials and the seller's legal details are configured. Without those secrets the function intentionally returns `payments_not_configured`.
