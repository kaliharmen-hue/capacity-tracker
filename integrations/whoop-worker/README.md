# Personal OS WHOOP bridge

Secure OAuth bridge between WHOOP and the local-first Capacity Tracker.

## Privacy model

- The WHOOP Client Secret never goes into the GitHub Pages app.
- WHOOP access/refresh tokens are stored in Cloudflare KV.
- WHOOP health history is not persisted in the bridge; it is fetched from WHOOP when requested.
- The static app continues to store its own Personal OS data locally in IndexedDB.
- A future private ChatGPT connector can call the same bridge with a separate server-side API key.

## WHOOP scopes

The bridge requests only:

- `offline`
- `read:recovery`
- `read:sleep`
- `read:cycles`
- `read:workout`

## Cloudflare setup

1. Create a Cloudflare Worker named `personal-os-whoop`.
2. Create a Workers KV namespace for OAuth state and tokens.
3. Put that namespace ID into `wrangler.jsonc`.
4. Set the Worker public URL as `PUBLIC_BASE_URL`.
5. Add these as **Secrets** in Cloudflare, never as committed values:
   - `WHOOP_CLIENT_ID`
   - `WHOOP_CLIENT_SECRET`
   - `CHATGPT_API_KEY` (later, when the private ChatGPT connector is created)
6. Deploy the Worker.

Cloudflare should also have the non-secret variable:

`APP_ORIGIN=https://kaliharmen-hue.github.io/capacity-tracker/`

## WHOOP Developer Dashboard setup

Create a WHOOP app and register the redirect URI:

`<PUBLIC_BASE_URL>/oauth/callback`

Select the scopes listed above.

After WHOOP provides the Client ID and Client Secret, store them in the Cloudflare Worker Secrets.

## Endpoints

- `GET /health` — bridge health check.
- `GET /oauth/start` — starts WHOOP OAuth.
- `GET /oauth/callback` — completes OAuth and redirects back to the Capacity Tracker.
- `GET /api/whoop?days=30` — returns a normalised 1–90 day WHOOP window when called with an authorised Bearer token.
- `POST /api/disconnect` — revokes WHOOP access and clears the stored token.

## Normalised WHOOP record

Each main sleep is assigned to the local date on which that sleep ended (the waking day). The returned record can contain:

- Recovery score
- HRV (RMSSD)
- Resting heart rate
- SpO2
- Skin temperature
- Sleep duration
- REM, deep (slow-wave), light sleep, awake time, time in bed and no-data time (minutes)
- Sleep cycle count and sleep score state
- Sleep need and its baseline, debt, strain and nap components (minutes)
- Sleep performance, efficiency and consistency
- Disturbance count and respiratory rate
- Cycle strain
- Steps
- Cycle heart rate / energy
- Workouts and workout strain
- Workout energy (kilojoules), recorded percentage, distance/elevation (metres) and heart-rate zone durations (minutes)
- Recovery score state and calibration flag

This date-normalised shape is what the Capacity Tracker will join to its existing Daily Log and Capacity Building records.

`sleepDebtMinutes` is WHOOP's `sleep_needed.need_from_sleep_debt_milli` converted to minutes: the debt contribution to need **before this sleep**, not remaining debt after waking. Total sleep need sums all four components; the nap component is already negative or zero. Unavailable/unscored values are null; genuine zero values remain zero. Stage durations are nightly totals, not a hypnogram. Naps are not included as main-sleep days.

Existing sleep/recovery/cycle/workout scopes cover these measurements; no reconnect or extra API service is required. Sync 30 days refreshes locally stored history; the authenticated endpoint supports up to 90 days. MCP day/window reads also include live WHOOP-only waking dates without creating journal answers or modifying saved history. Historical data outside the live window uses the saved mirror and may lack the newly added fields.

Field definitions: [WHOOP API reference](https://developer.whoop.com/api/) and [sleep data model](https://developer.whoop.com/docs/developing/user-data/sleep/).


## Workers Builds settings

If the GitHub repository is connected in Cloudflare, configure **Settings > Build** as follows:

- Git repository: `kaliharmen-hue/capacity-tracker`
- Production branch: `main`
- Root directory: `integrations/whoop-worker`
- Build command: leave blank
- Deploy command: `npx wrangler deploy`

Cloudflare's integrated build system will install the project dependencies and use the Wrangler version pinned in this folder.

The existing deployed Worker is `capacity-tracker`, matching `wrangler.jsonc`.

## Private V2 photo storage

When iOS keeps Safari sign-in separate from the installed app, the signed-in
owner can issue a 128-bit random temporary code. Only the current owner session
can issue it; the server stores its SHA-256 hash for ten minutes. The user copies
it into their own home-screen app, never a chat or navigation URL. Redemption is
same-origin and no-store, and rechecks that the underlying session is still the
current owner. Existing photo access checks remain unchanged. No new paid
service or WHOOP scope is introduced.

Keep this account on Workers Free. `PHOTO_LIBRARY` is a SQLite Durable Object,
not R2. No R2 bucket or paid AI API is required. The application caps live images
at 250 MB and each JPEG at 750 KB. At capacity uploads fail safely; unreviewed
photos are never automatically evicted. Free-plan platform limits fail requests
rather than billing overages. Upgrading the account changes that protection.

`/api/meal-photos` requires the existing owner session. MCP photo reads require
`personal_os:read`; review receipts additionally require `personal_os:review`.
Older connections retain read access and need reconnecting to grant receipts.
The owner must enable cleanup in V2. A daily cron removes only images with a
successful receipt older than seven days; metadata survives. Provider recovery
backups may outlive live-image deletion. No new WHOOP authorization is needed
when the existing browser owner session is still valid.

<!-- Cloudflare deployment trigger: 2026-10-22 -->

<!-- Cloudflare build-settings retry: 2026-10-23 -->
