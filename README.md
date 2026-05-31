# Capacity Tracker

A private, local-first daily capacity tracking app for energy, clarity, sleep, nervous system state, hormonal signs, stimulants, movement, load, recovery, and gentle pattern review.

## Stack

- Astro + TypeScript for a free static app
- Dexie / IndexedDB for structured local browser storage
- No backend, account, or login in version 1
- Export/import options so data stays portable

This can be hosted for free as a static site later, including GitHub Pages. If other people use the same hosted app, their entries stay in their own browser storage unless they export and share them.

## Pages

- `Today`: daily reflective tracker with first-person prompts
- `History`: 7, 14, and 30 day dashboard
- `Insights`: cautious pattern notes and relational stress scoring
- `Export`: Markdown, CSV, JSON backup, and JSON import

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
