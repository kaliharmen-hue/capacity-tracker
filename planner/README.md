# Personal Planner

Standalone owner-only planner. The browser uses a separate Cloudflare Worker origin and an isolated SQLite-backed Durable Object. Each task write compares against its last-seen version. Changes to different tasks can sync independently. If both devices edit the same task, the app shows both versions and asks which to keep. Pending edits survive browser reloads on the same origin. Sign-out clears the local cache after pending changes have synced.

## Test locally

From the repository root, run these against an isolated local instance. The test key below is a public fixture for localhost.

```sh
npx --yes wrangler@4.167.0 dev --config planner/cloud/wrangler.toml --ip 127.0.0.1 --port 8794 --var PLANNER_OWNER_KEY:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
node --test planner/cloud/integration-test.mjs
node integrations/tiimo-extension/parser-test.mjs
```

Run the Worker and the tests in separate terminals. Local sign-in uses the test key. The tests write synthetic tasks to local Durable Object storage.

## Deploy

Deploy only the `personal-planner-private` Worker from this branch and configuration. Use an authorized Cloudflare profile for the intended account and verify the account with `whoami` before deploying. The planner requires only Workers Static Assets and a SQLite-backed Durable Object, both available on Workers Free.

```sh
npx --yes wrangler@4.167.0 auth activate personal-planner
npx --yes wrangler@4.167.0 whoami
npx --yes wrangler@4.167.0 --profile personal-planner deploy --config planner/cloud/wrangler.toml
```

In the Cloudflare dashboard, open **Workers & Pages → personal-planner-private → Settings → Variables and Secrets**. Add a **Secret** named `PLANNER_OWNER_KEY`. Use a password manager to generate and save a random 43-character value using letters and numbers. Use that key to sign in to the planner on each device. Rotating the key revokes all existing sessions. The API returns 503 until the secret is configured.

If the profile sees multiple accounts, set `CLOUDFLARE_ACCOUNT_ID` in the current terminal to select the intended one before deploying.

For GitHub-connected Builds, use a separate project targeting `personal-planner-prototype` and the deploy command above without the local profile flag. The existing Personal OS Builds configuration is independent.

## Move or restore data

Use **Export backup** to download versioned JSON from any device that has the tasks. **Import backup** adds missing tasks and skips identical ones. A conflicting task ID stops the import before it makes changes. To move tasks from the prototype on a different origin, export on that origin and import on the Worker origin. Data entered on this device before sign-in is queued for upload once signed in.

Tiimo diagnostics and parsers are local-only and represent partial observations. Keep captures outside the checkout and do not commit them. The planner has no Tiimo upload endpoint.
