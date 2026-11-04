# Personal Operating System

A private, local-first personal operating system for a daily log, weekly review, monthly insights, and one-at-a-time experiments.

## Stack

- Astro + TypeScript for a free static app
- Dexie / IndexedDB for structured local browser storage
- No backend, account, or login in version 1
- Export/import options so data stays portable

This can be hosted for free as a static site later, including GitHub Pages. If other people use the same hosted app, their entries stay in their own browser storage unless they export and share them.

## Pages

- `Daily Log`: daily reflective tracker with first-person prompts
- `Capacity Building`: progressive life-capacity plan with daily foundation practices, early nutrition support, weekly review, and staged progression
- `Capacity Timeline`: daily Capacity States plus episodes made from at least 3 consecutive Reduced or Significant reduction days
- `Weekly Review`: 7, 14, and 30 day dashboard with energy, clarity, capacity, activation, sleep, work/activity fit, and relational stress signals
- `Monthly Insights`: cautious recent-month pattern notes, visual rhythm boards, relational stress scoring, and optimisation signals
- `Experiments`: one active experiment at a time, with Daily Log adherence/effect check-ins and a cautious before/during readout
- `Export`: Markdown, CSV, JSON backup, and JSON import

## V2 meal photos and zero-cost hosting

The additive `/v2/` page uses the existing WHOOP owner session and private
Cloudflare Worker. Existing Daily Log records and all historical database stores
remain intact. V2 logs have explicit draft/complete status: protocol checkboxes on
a draft are unknown, not missed sessions. Per-date recovery journals protect
pending edits when switching dates or leaving the page.

Photos are resized locally to at most 1280 pixels and 750 KB JPEG, stripping EXIF
and GPS metadata. Uploads require consent. Offline uploads remain in IndexedDB
until retried successfully. This is a private photo journal for visual review in
ChatGPT, not an in-app nutrition estimation API. Nutrition interpretation stays
in the review conversation; no paid AI API is called.

The Worker uses SQLite Durable Objects on **Workers Free**, not R2. It refuses
uploads at 250 MB rather than evicting unreviewed photos. Do not upgrade Workers
to a paid plan or add an R2 binding. Free-plan service limits can interrupt
requests instead of generating overage charges. This safeguard does not govern
unrelated products used elsewhere in the Cloudflare account.

The bridge exposes authenticated photo listing and actual image retrieval.
Only a separate `personal_os:review` permission can acknowledge exact retrieved
images after a review is saved. With owner-enabled cleanup, these images are
removed after a seven-day grace period by the daily 03:15 UTC cleanup job. Dates,
times and notes stay. A failed or missed review never authorizes deletion.
Standard JSON backups include V2 records but not private image binaries.

Verification: `npm test`, `npm run build`, then `node scripts/verify-v2.mjs`.
The browser test uses isolated synthetic data, tests the real IndexedDB upgrade,
date-switch autosave and compressed photo upload/reload, and saves screenshots
under ignored `qa/`. Set `PLAYWRIGHT_PATH` and `BROWSER_PATH` on other machines.

## Local Commands

```bash
npm install
npm run build
npm run serve
```

Then open:

```text
http://127.0.0.1:4322/
```

## Install on Phone

Open the live site on your phone:

```text
https://kaliharmen-hue.github.io/capacity-tracker/
```

On iPhone, open it in Safari, tap Share, then Add to Home Screen.

On Android, open it in Chrome and choose Install app or Add to Home screen.

For development:

```bash
npm run dev
```

If Astro dev mode has trouble on a Windows/OneDrive path, use `npm run build` followed by `npm run serve`.
