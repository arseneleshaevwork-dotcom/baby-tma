# Web payments launch runbook

## Customer flow

1. The customer opens the standalone website or installs it as a PWA.
2. The Premium page offers 349 RUB per month or 899 RUB per three months without requiring Telegram Login.
3. The browser creates a random guest billing key; only its SHA-256 hash is stored on the server. A signed-in customer continues to use the verified Telegram identity.
4. After explicit subscription and recurring-payment consent, YooKassa opens its hosted checkout with the methods enabled for the shop, including cards and SBP where available.
5. The browser returns to `index.html?payment=return`, but access changes only after the verified YooKassa notification is processed.
6. The app refreshes subscription status through the guest billing key or web session. Telegram Login remains optional and is used for cross-device data sync.

Inside the Mini App the customer chooses either Telegram Stars or "Card / SBP". The second option creates a short-lived one-time handoff, opens the independent web app in the external browser, signs the same verified Telegram user into the web session without a second Telegram prompt, and continues through YooKassa. Stars remain 299 monthly or 769 for a one-time 90-day period.

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
- Guest monthly checkout opens YooKassa without a Telegram Login prompt and activates Premium in the purchasing browser.
- Quarterly SBP checkout grants Premium on both surfaces and sets the correct next charge date.
- A repeated webhook does not extend access twice.
- Cancelling renewal preserves access until the paid end date; resuming restores the scheduled charge.
- A failed renewal enters `past_due`, retries with backoff and remains visible in admin.
- A full refund revokes the web entitlement; a partial refund does not revoke the whole paid period.
- Logout revokes the web session and another browser cannot reuse it after revocation.
- Diary edits made on web appear in the Mini App and conflicts keep the newest timestamp.

Do not enable the web payment buttons for advertising traffic until YooKassa production credentials and the seller's legal details are configured. Without those secrets the function intentionally returns `payments_not_configured`.
