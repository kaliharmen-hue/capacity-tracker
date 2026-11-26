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

Production deploys are handled by `.github/workflows/deploy-planner.yml`. Merge a reviewed pull request into `personal-planner-prototype`; GitHub Actions runs the Planner regression and Chromium suites, then deploys only the existing `personal-planner-private` Worker from `planner/cloud/wrangler.toml`. The workflow requires the repository secret `CLOUDFLARE_API_TOKEN`, scoped to that Worker with the Editor role. It does not read or write task records.

The production backup is a separate owner action. The Worker uses the existing SQLite-backed Durable Object; Stage 2 adds an optional JSON task field with an empty default and no storage-class migration. To roll back application code, revert the deployment commit on `personal-planner-prototype`; the same checks run before the prior UI and Worker code are redeployed. Cloudflare version rollback restores Worker code, not stored task data, so retain the exported backup.

For an authorized manual recovery deploy, use the Wrangler version pinned by the workflow and verify the intended Cloudflare account before deploying:

```sh
npx --yes wrangler@4.167.0 whoami
npx --yes wrangler@4.167.0 deploy --config planner/cloud/wrangler.toml
```

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

For a stalled connection, sign in to Planner, open Settings and choose
**Check ChatGPT connection**. The owner-only check reports whether an OAuth
connection was issued and shows up to twenty recent connection stages under
Connection details. It contains timestamps and fixed reason codes only:
no passwords, tokens, authorization codes, state values, task content or PKCE
verifiers. Older unfinished requests and unexchanged approvals are reported
by timestamp. A spinning Connect button in ChatGPT can mean a separate Planner
approval tab is still waiting for **Allow connection**; it does not prove the
Worker is down. Expired requests must be restarted through the same bridge.

The owner key and browser cookies cannot authorize MCP calls. Creating tasks
requires a stable UUID request_id for retry safety; updates require the last
read task version and reject stale edits. There is no delete, bulk replacement,
Personal OS access or Tiimo-write tool. Settings-issued keys also work with the
restricted `/api/integration/tasks` API. Optional separately configured legacy
PLANNER_READ_KEY/PLANNER_WRITE_KEY secrets must be rotated/deleted separately.

Active browser sessions renew their 30-day expiry at most once daily, with an
absolute 180-day reauthentication limit. Sync runs after edits, focus/visibility
changes, reconnection and once per minute while visible and signed in.

## Stage 2 dashboard

The dashboard opens on Today, with a Today’s Focus panel, a separate Waiting for Others section, and a Tomorrow preview. Upcoming keeps intended working dates distinct from actual deadlines. Projects are expandable and show task status counts. In Progress has its own view. The Personal, Hangar47 and Personal Training filters use the task's explicit **Area** when set; older records without an area are grouped only when their project name clearly matches a familiar label, and otherwise remain visible under **All**. Flexible is the default commitment type; the dashboard never schedules outstanding work automatically. Workload totals include only known task durations.

Area is optional and defaults to empty for older records. The MCP schema exposes it alongside planned dates, progress notes, responsibility, commitment type and the other task fields. Older cached clients preserve it during edits.
