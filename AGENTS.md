# Cloudflare project instructions

This repository contains a static Astro app plus a Cloudflare Worker integration.

## Cloudflare tooling

- Follow Cloudflare's current agent guidance at https://developers.cloudflare.com/agent-setup/.
- Prefer Wrangler for this existing Worker project because it already has a `wrangler.jsonc`.
- Use Cloudflare API/MCP tooling for account-level operations when available.
- Never commit API tokens, OAuth client secrets, refresh tokens, `.dev.vars`, or environment secret values.

## WHOOP Worker

The Worker lives in:

`integrations/whoop-worker`

Cloudflare Workers Builds should use:

- Worker name: `personal-os-whoop`
- Production branch: `main`
- Root directory: `integrations/whoop-worker`
- Build command: leave blank
- Deploy command: `npx wrangler deploy`

The Cloudflare Worker name must match the `name` value in `wrangler.jsonc`.

## Required Cloudflare resources

Create a Workers KV namespace for WHOOP OAuth state and tokens and bind it to the Worker as:

`WHOOP_AUTH`

The namespace ID is not secret and belongs in `wrangler.jsonc`.

Store these values as Cloudflare Worker secrets, never in GitHub:

- `WHOOP_CLIENT_ID`
- `WHOOP_CLIENT_SECRET`
- `CHATGPT_API_KEY` (only when the private ChatGPT connector is added)

Set these non-secret Worker variables:

- `APP_ORIGIN=https://kaliharmen-hue.github.io/capacity-tracker/`
- `PUBLIC_BASE_URL=<the deployed Worker origin>`

Before changing Cloudflare configuration, verify current Cloudflare documentation rather than assuming older Wrangler behaviour.
