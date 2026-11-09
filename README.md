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
