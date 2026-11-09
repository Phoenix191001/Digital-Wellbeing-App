# Pause

A private, mobile-first web app for university students (Digital Well-Being and Mental Health midterm). Built from `Pause_App_Feature_Spec.docx`.

Plain HTML, CSS and JavaScript, installable as a PWA, works offline after the first visit.

## Features
F1 Pause check-in · F2 Finish-line bites (24 cards) · F3 Focus sessions + play timer · F4 Night wind-down · F5 Something else to do (25 challenges, share invite) · F6 Talk to someone + private mood notes · F7 Stay safe (8 cards) · F8 My week · F9 Onboarding, settings, privacy.

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

**Tests:** `node --test tests/api.test.js` (API rules, in-memory store). `TEST_SUPABASE=1` runs the same tests through the Supabase adapter against a real Postgres via `tests/pgshim.js`. With `PORT=8124 node tests/server.js` running, `node tests/ui.test.js` runs the browser flows (needs Playwright).
