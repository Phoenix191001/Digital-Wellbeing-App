# Pause

A private, mobile-first web app for university students (Digital Well-Being and Mental Health midterm). Built from `Pause_App_Feature_Spec.docx`.

Plain HTML, CSS and JavaScript, installable as a PWA, works offline after the first visit.

## Features
F1 Pause check-in · F2 Finish-line bites (24 cards) · F3 Focus sessions + play timer · F4 Night wind-down · F5 Something else to do (25 challenges, share invite) · F6 Talk to someone + private mood notes · F7 Stay safe (8 cards) · F8 My week · F9 Onboarding, settings, privacy.

## New: Study, wellbeing and accounts
- **Study tab:** Pomodoro 🍅 (rounds, breaks, chime, progress ring), weekly study goals 🎯 + today's tasks, flashcards 🃏 with spaced repetition (Leitner boxes), and a **focus garden** 🌳 that grows one plant per 25 focus minutes and never wilts (no streaks, nothing lost).
- **Me:** sleep 😴 (I'm going to sleep / I'm awake log, generated sleep sounds with auto-off timer), app usage 📊 (self-logged from the phone's Screen Time, 7-day chart, optional gentle limits, plus automatic "pauses taken" and time in Pause), daily mood emoji.
- **Optional accounts ☁️** (Supabase Auth): sign up, sign in, forgot password, sync across devices, sign out, delete account. Mood notes are only uploaded if the student turns it on. Community posts stay anonymous and are never linked to an account.

**Turn on accounts (once):**
1. Supabase → SQL Editor → run `supabase-accounts.sql`.
2. Supabase → Authentication → URL Configuration: **Site URL** `https://pause-gamma.vercel.app`, and add the same URL under **Redirect URLs**.
3. Supabase → Authentication → Sign In / Providers → Email: decide on **Confirm email**. On = students must click a link (Supabase's built-in mailer only sends a few emails per hour; add your own SMTP for a class). Off = instant sign-up. The app handles both.

## Reminders (push notifications)
Optional, per device (Me → Settings → Reminders, or the 🔔 nudge on Pomodoro/Focus): a notification when a timer ends (even with سكون closed), a wind-down reminder 30 min before bedtime, and an optional daily check-in. `api/push.js` stores only the push address, time zone and reminder choices (Supabase `pause_kv`), and sends with Web Push (VAPID keys in Vercel env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).
**Turn on the every-minute sender once:** run `supabase-reminders.sql` in Supabase → SQL Editor (uses `pg_cron` + `pg_net`). On iPhone, reminders work after installing to the home screen (iOS 16.4+).

## Privacy by design
All data is in the phone's `localStorage`. No accounts, no server, no analytics. This is why there is **no Supabase**: the spec (section 3, principle 1) forbids a server database.

## Run locally
```
python3 -m http.server 8000
```

## Deploy
Import the repo in Vercel as a static site (no build command, no framework). `vercel.json` is included.

## To fill in
`content.js` → `COUNSELOR.contact` (the spec's `[FILL]` for Sir Rauf Malick's contact details).

## Find your people (community)
Safe, **space-separated** (female / male, self-declared) interest circles. Anonymous made-up names, plain-text posts (280 chars), reactions "🤝 I relate" / "💛 Thanks", replies, reports (3 different reports hide an item), self-harm text is never published (the author is shown *Talk to someone*), links/phone numbers/emails/@handles are blocked, 5 posts per hour.

**Two modes, chosen automatically:**
1. **Live** (when a database is connected): `api/community.js` stores everything in **Supabase** (Postgres). The viewer's space is read from the server-side user record, never from the request, so spaces cannot be crossed by editing URLs or API calls. The browser never talks to Supabase directly; only the server function uses the secret key, and the table has Row Level Security on with no policies, so the public anon key can read nothing.
2. **Fallback** (no database connected): no open posting. Each circle shows a "Join this circle's WhatsApp group" button per space, from `community-links.json`, plus rules and report instructions.

**Turn on live mode with Supabase:**
1. Create a free project at supabase.com.
2. Supabase -> SQL Editor -> New query -> paste all of `supabase.sql` -> Run.
3. Supabase -> Project Settings -> API: copy the **Project URL** and the **service_role** key (secret: server only, never in the app code or chat).
4. Vercel -> project -> Settings -> Environment Variables (Production): add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `MOD_PASSCODE` (a long passcode only you know).
5. Redeploy. Moderator page: `#/mod` (not linked anywhere).

(Upstash Redis is also supported through `KV_REST_API_URL` / `KV_REST_API_TOKEN`; Supabase takes priority if both are set.)

**Tests:** `node --test tests/push.test.js` (reminder API), `node tests/reminders.test.js` (reminders in a browser, needs the test server). Also: `node tests/features.test.js` (Study, wellbeing, accounts with a mocked Supabase) and `node --test tests/account.test.mjs` (delete-account API, sync merge rules). Also: `node --test tests/api.test.js` (API rules, in-memory store). `TEST_SUPABASE=1` runs the same tests through the Supabase adapter against a real Postgres via `tests/pgshim.js`. With `PORT=8124 node tests/server.js` running, `node tests/ui.test.js` runs the browser flows (needs Playwright).
