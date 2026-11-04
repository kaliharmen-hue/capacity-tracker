const TTL = 600;
const reply = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
async function key(code) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return 'phone-code:' + [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function phoneConnection(request, env) {
  if (request.headers.get('Origin') !== new URL(env.APP_ORIGIN).origin) return reply({ error: 'Invalid origin' }, 403);
  if (!request.headers.get('Content-Type')?.includes('application/json')) return reply({ error: 'JSON required' }, 415);
  const text = await request.text();
  if (text.length > 2048) return reply({ error: 'Request too large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return reply({ error: 'Invalid request' }, 400); }
  const ownerId = await env.WHOOP_AUTH.get('owner-session');
  if (new URL(request.url).pathname.endsWith('/code')) {
    const authorization = request.headers.get('Authorization') || '';
    if (!ownerId || authorization !== 'Bearer ' + ownerId || !await env.WHOOP_AUTH.get(`session:${ownerId}`)) {
      return reply({ error: 'Generate the code in the browser where WHOOP sign-in finished.' }, 401);
    }
    const code = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const expiresAt = Date.now() + TTL * 1000;
    await env.WHOOP_AUTH.put(await key(code), JSON.stringify({ sessionId: ownerId, expiresAt }), { expirationTtl: TTL });
    return reply({ code, expiresAt });
  }
  const code = typeof body?.code === 'string' ? body.code.replace(/[\s-]/g, '').toLowerCase() : '';
  if (!/^[0-9a-f]{32}$/.test(code)) return reply({ error: 'Paste the full temporary connection code.' }, 400);
  const stored = await env.WHOOP_AUTH.get(await key(code), 'json');
  if (!stored) return reply({ error: 'Code not found yet or expired. Wait a few seconds and retry, or create a new code.' }, 410);
  if (stored.expiresAt <= Date.now() || stored.sessionId !== ownerId || !await env.WHOOP_AUTH.get(`session:${stored.sessionId}`)) {
    return reply({ error: 'This code has expired or the connection changed. Create a new code.' }, 410);
  }
  // Delivery is retryable until expiry if a mobile network drops the first response.
  return reply({ session: stored.sessionId });
}
