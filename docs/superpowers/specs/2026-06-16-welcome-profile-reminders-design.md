# Welcome, Profile Collection, and Reminders Design

Goal: make the first app experience clearer and more valuable by collecting baby profile data, explaining reminders, and showing the next meaningful baby event on the home screen.

## Product Behavior
- Replace the long onboarding with a brighter three-step flow: value promise, baby profile, reminders.
- Collect baby name, birthdate, wake time, feeding type, and reminder consent in one focused profile step.
- When birthdate is provided, calculate age in full months and sync `ageMonths`, home schedule fields, analytics profile, and baby name display.
- Show a compact home card for the next baby milestone or birthday within the next 45 days.
- Keep schedule reminders in-app after generation; keep Telegram/backend reminder consent for birthday and age milestones through existing analytics and notification tables.

## Data Flow
- Browser storage remains the immediate source of truth.
- `BabyAnalytics.saveBabyProfile` persists name, birthdate, and age into analytics queue.
- `notifications_enabled` / `notifications_disabled` events sync notification settings to Supabase through the existing analytics backend.
- No new secrets or backend tables are required for this iteration.

## Testing
- Unit test baby milestone helper for next event copy and no-birthdate fallback.
- Existing analytics and tracker tests must continue to pass.
- Browser verification must confirm onboarding can save profile, home event card appears, and generation still works.
