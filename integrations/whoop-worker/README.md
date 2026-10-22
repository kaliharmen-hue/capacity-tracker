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
- Sleep performance, efficiency and consistency
- Disturbance count and respiratory rate
- Cycle strain
- Steps
- Cycle heart rate / energy
- Workouts and workout strain

This date-normalised shape is what the Capacity Tracker will join to its existing Daily Log and Capacity Building records.


## Workers Builds settings

If the GitHub repository is connected in Cloudflare, configure **Settings > Build** as follows:

- Git repository: `kaliharmen-hue/capacity-tracker`
- Production branch: `main`
- Root directory: `integrations/whoop-worker`
- Build command: leave blank
- Deploy command: `npx wrangler deploy`

Cloudflare's integrated build system will install the project dependencies and use the Wrangler version pinned in this folder.

The Cloudflare Worker project itself must be named `personal-os-whoop` so it matches `wrangler.jsonc`.
