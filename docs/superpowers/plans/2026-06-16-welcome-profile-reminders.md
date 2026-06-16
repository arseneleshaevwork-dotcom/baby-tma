# Welcome Profile Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add colorful onboarding, stronger profile collection, and event reminders without expanding backend scope.

**Architecture:** Reuse existing localStorage, analytics client, onboarding, notification preference, and milestone helper files. Add one small milestone presentation helper and call it from the home page.

**Tech Stack:** Static HTML/CSS/JS, localStorage, Supabase analytics events, Telegram Mini App popup API.

---

### Task 1: Milestone Helper
**Files:** `baby-milestones.js`, `tests/baby-milestones.test.js`
- [ ] Add tests for `buildNextBabyEvent` birthday/month/fallback behavior.
- [ ] Implement helper using existing date utilities.
- [ ] Export helper for browser and Node tests.

### Task 2: Onboarding and Profile Save
**Files:** `onboarding.js`, `notifications.js`
- [ ] Replace five slides with three value-focused slides.
- [ ] Save name, birthdate, wake time, feeding type, calculated age, and reminder consent.
- [ ] Track profile and reminder preference through existing analytics events.

### Task 3: Home Event Card
**Files:** `index.html`, `style.css`
- [ ] Add a “Следующее событие” card under the today hero.
- [ ] Render milestone copy from local baby profile.
- [ ] Add clear actions: edit profile and learn what matters now.

### Task 4: Verification
- [ ] Run JS syntax checks.
- [ ] Run all unit tests.
- [ ] Run browser smoke test for onboarding, profile save, home event card, and schedule generation.
- [ ] Commit and push to `main`.
