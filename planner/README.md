# Personal Planner

Standalone owner-only planner. The browser uses a separate Cloudflare Worker origin and an isolated SQLite-backed Durable Object. Each task write compares against its last-seen version. Changes to different tasks can sync independently. If both devices edit the same task, the app shows both versions and asks which to keep. Pending edits survive browser reloads on the same origin. Sign-out clears the local cache after pending changes have synced.

## Test locally

From the repository root, run these against an isolated local instance. The test key below is a public fixture for localhost.

```sh
npx --yes wrangler@4.167.0 dev --config planner/cloud/wrangler.toml --ip 127.0.0.1 --port 8794 --var PLANNER_LOCAL_TEST:1 --var PLANNER_OWNER_KEY:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
node --test planner/cloud/integration-test.mjs
node --test planner/cloud/session-test.mjs planner/cloud/integration-access-test.mjs planner/cloud/connector-test.mjs planner/cloud/oauth-test.mjs
node planner/cloud/browser-test.mjs
node planner/cloud/oauth-browser-test.mjs
node integrations/tiimo-extension/parser-test.mjs
```

Run the Worker and the tests in separate terminals. Local sign-in uses the test key. The tests write synthetic tasks to local Durable Object storage.

## Deploy

Deploy only the `personal-planner-private` Worker from this branch and configuration. Use an authorized Cloudflare profile for the intended account and verify the account with `whoami` before deploying. The planner requires only Workers Static Assets and a SQLite-backed Durable Object, both available on Workers Free.

```sh
npx --yes wrangler@4.167.0 auth activate personal-planner
npx --yes wrangler@4.167.0 whoami
npx --yes wrangler@4.167.0 deploy --config planner/cloud/wrangler.toml
```

In the Cloudflare dashboard, open **Workers & Pages → personal-planner-private → Settings → Variables and Secrets**. Add a **Secret** named `PLANNER_OWNER_KEY`. Use a password manager to generate and save a random 43-character value using letters and numbers. Use that key to sign in to the planner on each device. Rotating the key revokes all existing sessions. The API returns 503 until the secret is configured.

If the profile sees multiple accounts, set `CLOUDFLARE_ACCOUNT_ID` in the current terminal to select the intended one before deploying.

Deployment currently uses the manually run command above with the bound personal-planner profile. GitHub runs Planner tests, not deployments. A separate GitHub-connected Build could be configured later; the existing Personal OS Builds configuration is independent.

## Move or restore data

Use **Export backup** to download versioned JSON from any device that has the tasks. **Import backup** adds missing tasks and skips identical ones. A conflicting task ID stops the import before it makes changes. To move tasks from the prototype on a different origin, export on that origin and import on the Worker origin. Data entered on this device before sign-in is queued for upload once signed in.

Tiimo diagnostics and parsers are local-only and represent partial observations. Keep captures outside the checkout and do not commit them. The planner has no Tiimo upload endpoint.

## Private ChatGPT connector

The independently hosted `/mcp` endpoint exposes `list_tasks`, `create_task` and
`update_task`. Open [Personal Planner Bridge](https://chatgpt.com/plugins/plugin_asdk_app_6b05ce7bde8881919a86cb899d6cdc16) and choose Connect.
Sign in on Planner if needed, then approve read-only or read/create/update access.
ChatGPT uses OAuth authorization code + S256 PKCE with a pre-registered public
client (`personal-planner-chatgpt`, token authentication `none`) and the exact
documented callback `https://chatgpt.com/connector_platform_oauth_redirect`.
There is no client secret. OAuth discovery is public; all task access is private.
Codes expire after five minutes and are single-use. Access tokens expire after
one hour; rotating refresh tokens expire after thirty days of inactivity.
Only hashes of issued credentials are stored. Tokens are bound to the exact
MCP resource, client, approved permissions and current owner-key version.
Revoke all integration access in Settings without signing out or deleting tasks.
Owner-key rotation also invalidates generated grants, codes and pending consent.

The original API-key ChatGPT setup was incorrect: ChatGPT has no custom API-key
entry field. Advanced integration keys remain available for other clients, but
are not the ChatGPT linking method. No owner key belongs in a plugin or chat.

The original private package (`plugins_6b05c7be12048191b346d2271c09ab72`)
contains the Planner skill and a remote MCP declaration for compatible clients.
ChatGPT also needs a registered custom MCP connection, not just that package.
The private bridge was registered through Plugins → Add → Add custom MCP server,
using the existing Worker endpoint and the public client ID above, token auth
method `none`, the discovered endpoints and resource, and base scopes
`planner:read planner:write`. Its app ID is
`asdk_app_6b05ce7bde8881919a86cb899d6cdc16`; the original package now references
that verified app in `.app.json`. This creates no second hosted backend, data
store or paid service. The bridge's Connect step and the owner's approval are
still required before real task access; registering a connection is not proof
that it is authenticated. No production task was created just to test linking.

The owner key and browser cookies cannot authorize MCP calls. Creating tasks
requires a stable UUID request_id for retry safety; updates require the last
read task version and reject stale edits. There is no delete, bulk replacement,
Personal OS access or Tiimo-write tool. Settings-issued keys also work with the
restricted `/api/integration/tasks` API. Optional separately configured legacy
PLANNER_READ_KEY/PLANNER_WRITE_KEY secrets must be rotated/deleted separately.

Active browser sessions renew their 30-day expiry at most once daily, with an
absolute 180-day reauthentication limit. Sync runs after edits, focus/visibility
changes, reconnection and once per minute while visible and signed in.
