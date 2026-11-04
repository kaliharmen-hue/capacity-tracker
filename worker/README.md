# Personal OS secure API worker

The GitHub Pages app is static, so it must not contain a WHOOP client secret or an OpenAI API key. This Worker provides the secure boundary for both services.

## Configure

1. Create a Cloudflare KV namespace and put its ID in `worker/wrangler.toml`.
2. Create a WHOOP Developer App with redirect URI `https://YOUR_WORKER_DOMAIN/whoop/callback` and scopes `offline read:sleep read:recovery read:cycles read:workout`.
3. Set Worker secrets:

```text
wrangler secret put WHOOP_CLIENT_ID
wrangler secret put WHOOP_CLIENT_SECRET
wrangler secret put OPENAI_API_KEY
wrangler secret put ALLOWED_ORIGIN
```

`ALLOWED_ORIGIN` should be the exact GitHub Pages origin, for example `https://kaliharmen-hue.github.io` or the repository Pages URL as appropriate.

4. Deploy with `wrangler deploy`.
5. Build the app with `PUBLIC_PERSONAL_OS_API_BASE=https://YOUR_WORKER_DOMAIN`.

The Worker stores only encrypted-provider token material in KV and does not retain meal photos. Meal images are resized in the browser, sent only after consent, analysed once, and discarded by the Worker. The confirmed nutritional estimate is stored locally in IndexedDB. OpenAI API usage is pay-as-you-go; the amount depends on image size, model and output tokens. WHOOP API access is currently provided through WHOOP's developer platform, subject to its limits and OAuth approval.

