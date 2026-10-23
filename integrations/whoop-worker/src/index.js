const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const WHOOP_API = "https://api.prod.whoop.com/developer/v2";
const WHOOP_SCOPES = ["offline", "read:recovery", "read:sleep", "read:cycles", "read:workout"];

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders }
  });
}

function randomHex(bytes) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return [...data].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function bearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return base64Url(new Uint8Array(digest));
}

function personalOsResource(env) {
  return `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/mcp`;
}

async function chatgptAuthVersion(env) {
  return Number(await env.WHOOP_AUTH.get("chatgpt-auth-version") || "1");
}

async function loadChatGPTOAuthToken(token, env) {
  if (!token) return null;
  const stored = await env.WHOOP_AUTH.get(`chatgpt-access:${token}`, "json");
  if (!stored) return null;
  if (Number(stored.expiresAt || 0) <= Date.now()) {
    await env.WHOOP_AUTH.delete(`chatgpt-access:${token}`);
    return null;
  }
  if (Number(stored.version || 0) !== await chatgptAuthVersion(env)) return null;
  if (stored.resource !== personalOsResource(env)) return null;
  if (!String(stored.scope || "").split(/\s+/).includes("personal_os:read")) return null;
  return stored;
}

async function isChatGPTKey(token, env) {
  if (!token) return false;
  return Boolean(await loadChatGPTOAuthToken(token, env));
}

async function loadOwnerSession(request, env) {
  const bearer = bearerToken(request);
  if (!bearer) return null;
  const stored = await env.WHOOP_AUTH.get(`session:${bearer}`, "json");
  return stored ? { sessionId: bearer, data: stored } : null;
}

function appOrigin(env) {
  return new URL(env.APP_ORIGIN).origin;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (origin && origin === appOrigin(env)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Vary": "Origin"
    };
  }
  return {};
}

function localDate(iso, offset = "Z") {
  if (!iso) return null;
  let offsetMinutes = 0;
  if (offset !== "Z") {
    const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
    if (match) {
      const sign = match[1] === "-" ? -1 : 1;
      offsetMinutes = sign * (Number(match[2]) * 60 + Number(match[3]));
    }
  }
  return new Date(new Date(iso).getTime() + offsetMinutes * 60000).toISOString().slice(0, 10);
}

async function tokenRequest(body, env) {
  const response = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error_description || payload?.error || "WHOOP token request failed");
  return payload;
}

async function loadSession(request, env) {
  const bearer = bearerToken(request);
  if (!bearer) return null;

  if (await isChatGPTKey(bearer, env)) {
    const ownerSession = await env.WHOOP_AUTH.get("owner-session");
    if (!ownerSession) return null;
    const stored = await env.WHOOP_AUTH.get(`session:${ownerSession}`, "json");
    return stored ? { sessionId: ownerSession, data: stored } : null;
  }

  const stored = await env.WHOOP_AUTH.get(`session:${bearer}`, "json");
  return stored ? { sessionId: bearer, data: stored } : null;
}

async function ensureAccessToken(session, env) {
  if (session.data.expires_at && session.data.expires_at > Date.now() + 60000) {
    return session.data.access_token;
  }
  if (!session.data.refresh_token) throw new Error("WHOOP connection needs to be renewed");

  const refreshed = await tokenRequest(
    {
      grant_type: "refresh_token",
      refresh_token: session.data.refresh_token,
      client_id: env.WHOOP_CLIENT_ID,
      client_secret: env.WHOOP_CLIENT_SECRET,
      scope: "offline"
    },
    env
  );

  session.data = {
    ...session.data,
    ...refreshed,
    expires_at: Date.now() + Number(refreshed.expires_in || 3600) * 1000
  };
  await env.WHOOP_AUTH.put(`session:${session.sessionId}`, JSON.stringify(session.data));
  return session.data.access_token;
}

async function whoopFetch(path, accessToken) {
  const response = await fetch(`${WHOOP_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`WHOOP API ${response.status}: ${await response.text()}`);
  return response.json();
}

async function collection(path, accessToken, start, end) {
  const records = [];
  let nextToken = "";
  for (let page = 0; page < 12; page += 1) {
    const params = new URLSearchParams({ limit: "25", start, end });
    if (nextToken) params.set("nextToken", nextToken);
    const payload = await whoopFetch(`${path}?${params.toString()}`, accessToken);
    records.push(...(payload.records || []));
    nextToken = payload.next_token || "";
    if (!nextToken) break;
  }
  return records;
}

function sleepHours(sleep) {
  const stages = sleep?.score?.stage_summary;
  if (!stages) return null;
  const asleep = Number(stages.total_light_sleep_time_milli || 0)
    + Number(stages.total_slow_wave_sleep_time_milli || 0)
    + Number(stages.total_rem_sleep_time_milli || 0);
  return asleep ? asleep / 3600000 : null;
}

async function getWhoopWindow(accessToken, days) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days - 1);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [recoveries, sleeps, cycles, workouts] = await Promise.all([
    collection("/recovery", accessToken, startIso, endIso),
    collection("/activity/sleep", accessToken, startIso, endIso),
    collection("/cycle", accessToken, startIso, endIso),
    collection("/activity/workout", accessToken, startIso, endIso)
  ]);

  const recoveryBySleep = new Map(recoveries.map((item) => [item.sleep_id, item]));
  const cycleById = new Map(cycles.map((item) => [item.id, item]));
  const workoutsByDate = new Map();

  for (const workout of workouts) {
    const date = localDate(workout.start, workout.timezone_offset);
    const list = workoutsByDate.get(date) || [];
    list.push({
      id: workout.id,
      sportName: workout.sport_name,
      start: workout.start,
      end: workout.end,
      strain: workout.score?.strain ?? null,
      averageHeartRate: workout.score?.average_heart_rate ?? null,
      maxHeartRate: workout.score?.max_heart_rate ?? null
    });
    workoutsByDate.set(date, list);
  }

  const records = sleeps
    .filter((sleep) => !sleep.nap)
    .map((sleep) => {
      const date = localDate(sleep.end, sleep.timezone_offset);
      const recovery = recoveryBySleep.get(sleep.id);
      const cycle = cycleById.get(sleep.cycle_id);
      return {
        date,
        sleepId: sleep.id,
        cycleId: sleep.cycle_id,
        recoveryScore: recovery?.score?.recovery_score ?? null,
        hrvRmssdMs: recovery?.score?.hrv_rmssd_milli ?? null,
        restingHeartRate: recovery?.score?.resting_heart_rate ?? null,
        spo2Percentage: recovery?.score?.spo2_percentage ?? null,
        skinTempCelsius: recovery?.score?.skin_temp_celsius ?? null,
        sleepHours: sleepHours(sleep),
        sleepStart: sleep.start,
        sleepEnd: sleep.end,
        sleepPerformancePercentage: sleep.score?.sleep_performance_percentage ?? null,
        sleepEfficiencyPercentage: sleep.score?.sleep_efficiency_percentage ?? null,
        sleepConsistencyPercentage: sleep.score?.sleep_consistency_percentage ?? null,
        disturbanceCount: sleep.score?.stage_summary?.disturbance_count ?? null,
        respiratoryRate: sleep.score?.respiratory_rate ?? null,
        cycleStrain: cycle?.score?.strain ?? null,
        cycleKilojoule: cycle?.score?.kilojoule ?? null,
        averageHeartRate: cycle?.score?.average_heart_rate ?? null,
        maxHeartRate: cycle?.score?.max_heart_rate ?? null,
        stepCount: cycle?.step_count ?? null,
        workouts: workoutsByDate.get(date) || []
      };
    })
    .filter((record) => record.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days);

  return {
    generatedAt: new Date().toISOString(),
    requestedDays: days,
    records
  };
}

async function handleStart(request, env) {
  const state = randomHex(4); // WHOOP requires an 8-character state value.
  await env.WHOOP_AUTH.put(`oauth-state:${state}`, "1", { expirationTtl: 600 });

  const redirectUri = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/oauth/callback`;
  const url = new URL(WHOOP_AUTH_URL);
  url.searchParams.set("client_id", env.WHOOP_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", WHOOP_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return Response.redirect(url.toString(), 302);
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return json({ error: "Missing OAuth code or state" }, 400);

  const validState = await env.WHOOP_AUTH.get(`oauth-state:${state}`);
  if (!validState) return json({ error: "OAuth state was invalid or expired" }, 400);
  await env.WHOOP_AUTH.delete(`oauth-state:${state}`);

  const redirectUri = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/oauth/callback`;
  const tokens = await tokenRequest(
    {
      grant_type: "authorization_code",
      code,
      client_id: env.WHOOP_CLIENT_ID,
      client_secret: env.WHOOP_CLIENT_SECRET,
      redirect_uri: redirectUri
    },
    env
  );

  const sessionId = randomHex(32);
  const session = {
    ...tokens,
    expires_at: Date.now() + Number(tokens.expires_in || 3600) * 1000,
    connected_at: new Date().toISOString()
  };

  await env.WHOOP_AUTH.put(`session:${sessionId}`, JSON.stringify(session));
  await env.WHOOP_AUTH.put("owner-session", sessionId);

  const target = new URL("capacity/", env.APP_ORIGIN);
  target.searchParams.set("whoop", "connected");
  target.hash = `whoop_session=${sessionId}`;
  return Response.redirect(target.toString(), 302);
}

async function handleData(request, env) {
  const session = await loadSession(request, env);
  if (!session) return json({ error: "Not authorised" }, 401, corsHeaders(request, env));

  const accessToken = await ensureAccessToken(session, env);
  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("days") || 30);
  const days = Math.max(1, Math.min(90, Number.isFinite(requested) ? Math.round(requested) : 30));
  const payload = await getWhoopWindow(accessToken, days);
  return json(payload, 200, corsHeaders(request, env));
}



function validChatGPTRedirect(uri) {
  try {
    const url = new URL(uri);
    if (url.origin !== "https://chatgpt.com") return false;
    return url.pathname === "/connector_platform_oauth_redirect" || /^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(url.pathname);
  } catch {
    return false;
  }
}

function validChatGPTClientId(clientId) {
  try {
    const url = new URL(clientId);
    return url.origin === "https://chatgpt.com" && /^\/oauth\/(?:[A-Za-z0-9_-]+\/)?client\.json$/.test(url.pathname);
  } catch {
    return false;
  }
}

function oauthMetadata(env) {
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, "");
  return {
    issuer: base,
    authorization_response_iss_parameter_supported: true,
    authorization_endpoint: `${base}/oauth/chatgpt/authorize`,
    token_endpoint: `${base}/oauth/chatgpt/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["personal_os:read"],
    client_id_metadata_document_supported: true
  };
}

function protectedResourceMetadata(env) {
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, "");
  return {
    resource: personalOsResource(env),
    authorization_servers: [base],
    scopes_supported: ["personal_os:read"],
    resource_documentation: `${env.APP_ORIGIN.replace(/\/$/, "")}/privacy/`
  };
}

async function handleChatGPTAuthorize(request, env) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id") || "";
  const redirectUri = url.searchParams.get("redirect_uri") || "";
  const responseType = url.searchParams.get("response_type") || "";
  const scope = url.searchParams.get("scope") || "";
  const state = url.searchParams.get("state") || "";
  const codeChallenge = url.searchParams.get("code_challenge") || "";
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") || "";
  const resource = url.searchParams.get("resource") || "";

  if (
    responseType !== "code" ||
    !validChatGPTClientId(clientId) ||
    !validChatGPTRedirect(redirectUri) ||
    !state ||
    codeChallengeMethod !== "S256" ||
    !codeChallenge ||
    resource !== personalOsResource(env) ||
    !scope.split(/\s+/).includes("personal_os:read")
  ) {
    return json({ error: "invalid_request", error_description: "Invalid ChatGPT OAuth request." }, 400);
  }

  const requestId = randomHex(24);
  await env.WHOOP_AUTH.put(`chatgpt-oauth-request:${requestId}`, JSON.stringify({
    clientId,
    redirectUri,
    scope: "personal_os:read",
    state,
    codeChallenge,
    resource,
    createdAt: Date.now()
  }), { expirationTtl: 600 });

  const target = new URL("capacity/", env.APP_ORIGIN);
  target.searchParams.set("chatgpt_oauth", requestId);
  return Response.redirect(target.toString(), 302);
}

async function handleChatGPTOAuthDecision(request, env) {
  const ownerSession = await loadOwnerSession(request, env);
  if (!ownerSession) return json({ error: "Not authorised" }, 401, corsHeaders(request, env));

  const body = await request.json();
  const requestId = String(body?.requestId || "");
  const approved = body?.approved === true;
  const pending = await env.WHOOP_AUTH.get(`chatgpt-oauth-request:${requestId}`, "json");
  if (!pending) return json({ error: "OAuth request was invalid or expired" }, 400, corsHeaders(request, env));
  await env.WHOOP_AUTH.delete(`chatgpt-oauth-request:${requestId}`);

  const redirect = new URL(pending.redirectUri);
  redirect.searchParams.set("state", pending.state);
  redirect.searchParams.set("iss", env.PUBLIC_BASE_URL.replace(/\/$/, ""));

  if (!approved) {
    redirect.searchParams.set("error", "access_denied");
    redirect.searchParams.set("error_description", "Personal OS access was not approved.");
    return json({ redirectUrl: redirect.toString() }, 200, corsHeaders(request, env));
  }

  const code = `pos_code_${randomHex(32)}`;
  await env.WHOOP_AUTH.put(`chatgpt-code:${code}`, JSON.stringify({
    clientId: pending.clientId,
    redirectUri: pending.redirectUri,
    scope: pending.scope,
    codeChallenge: pending.codeChallenge,
    resource: pending.resource,
    version: await chatgptAuthVersion(env),
    expiresAt: Date.now() + 300000
  }), { expirationTtl: 300 });

  redirect.searchParams.set("code", code);
  return json({ redirectUrl: redirect.toString() }, 200, corsHeaders(request, env));
}

async function issueChatGPTOAuthTokens(env, grant) {
  const version = await chatgptAuthVersion(env);
  const accessToken = `pos_at_${randomHex(32)}`;
  const refreshToken = `pos_rt_${randomHex(32)}`;
  const now = Date.now();
  const access = {
    clientId: grant.clientId,
    scope: grant.scope,
    resource: grant.resource,
    version,
    expiresAt: now + 3600000
  };
  const refresh = {
    clientId: grant.clientId,
    scope: grant.scope,
    resource: grant.resource,
    version,
    expiresAt: now + 2592000000
  };
  await Promise.all([
    env.WHOOP_AUTH.put(`chatgpt-access:${accessToken}`, JSON.stringify(access), { expirationTtl: 3600 }),
    env.WHOOP_AUTH.put(`chatgpt-refresh:${refreshToken}`, JSON.stringify(refresh), { expirationTtl: 2592000 })
  ]);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refreshToken,
    scope: grant.scope
  };
}

async function handleChatGPTToken(request, env) {
  const form = await request.formData();
  const grantType = String(form.get("grant_type") || "");
  const clientId = String(form.get("client_id") || "");
  const resource = String(form.get("resource") || "");

  if (grantType === "authorization_code") {
    const code = String(form.get("code") || "");
    const redirectUri = String(form.get("redirect_uri") || "");
    const verifier = String(form.get("code_verifier") || "");
    const grant = await env.WHOOP_AUTH.get(`chatgpt-code:${code}`, "json");
    if (!grant || Number(grant.expiresAt || 0) <= Date.now()) {
      return json({ error: "invalid_grant" }, 400, { "Cache-Control": "no-store" });
    }
    if (
      grant.clientId !== clientId ||
      grant.redirectUri !== redirectUri ||
      grant.resource !== resource ||
      !verifier ||
      await sha256Base64Url(verifier) !== grant.codeChallenge
    ) {
      return json({ error: "invalid_grant" }, 400, { "Cache-Control": "no-store" });
    }
    await env.WHOOP_AUTH.delete(`chatgpt-code:${code}`);
    return json(await issueChatGPTOAuthTokens(env, grant), 200, { "Cache-Control": "no-store" });
  }

  if (grantType === "refresh_token") {
    const refreshToken = String(form.get("refresh_token") || "");
    const grant = await env.WHOOP_AUTH.get(`chatgpt-refresh:${refreshToken}`, "json");
    if (
      !grant ||
      Number(grant.expiresAt || 0) <= Date.now() ||
      Number(grant.version || 0) !== await chatgptAuthVersion(env) ||
      grant.clientId !== clientId ||
      grant.resource !== resource
    ) {
      return json({ error: "invalid_grant" }, 400, { "Cache-Control": "no-store" });
    }
    await env.WHOOP_AUTH.delete(`chatgpt-refresh:${refreshToken}`);
    return json(await issueChatGPTOAuthTokens(env, grant), 200, { "Cache-Control": "no-store" });
  }

  return json({ error: "unsupported_grant_type" }, 400, { "Cache-Control": "no-store" });
}

async function handleChatGPTKey(request, env) {
  const ownerSession = await loadOwnerSession(request, env);
  if (!ownerSession) return json({ error: "Not authorised" }, 401, corsHeaders(request, env));

  if (request.method === "GET") {
    const configured = Boolean(await env.WHOOP_AUTH.get("chatgpt-api-key-hash"));
    const mirror = await env.WHOOP_AUTH.get("personal-os-mirror", "json");
    return json({
      configured,
      mirrorSyncedAt: mirror?.syncedAt ?? null,
      mirrorRecordCount: Array.isArray(mirror?.records) ? mirror.records.length : 0
    }, 200, corsHeaders(request, env));
  }

  if (request.method === "POST") {
    const key = `pos_${randomHex(32)}`;
    await env.WHOOP_AUTH.put("chatgpt-api-key-hash", await sha256Hex(key));
    return json({ key, createdAt: new Date().toISOString() }, 200, corsHeaders(request, env));
  }

  if (request.method === "DELETE") {
    const nextVersion = await chatgptAuthVersion(env) + 1;
    await Promise.all([
      env.WHOOP_AUTH.put("chatgpt-auth-version", String(nextVersion)),
      env.WHOOP_AUTH.delete("chatgpt-api-key-hash"),
      env.WHOOP_AUTH.delete("personal-os-mirror")
    ]);
    return json({ revoked: true, mirrorDeleted: true }, 200, corsHeaders(request, env));
  }

  return json({ error: "Method not allowed" }, 405, corsHeaders(request, env));
}

async function handleMirrorSync(request, env) {
  const ownerSession = await loadOwnerSession(request, env);
  if (!ownerSession) return json({ error: "Not authorised" }, 401, corsHeaders(request, env));

  const payload = await request.json();
  const records = Array.isArray(payload?.records) ? payload.records : [];
  if (records.length > 180) return json({ error: "Too many daily records" }, 400, corsHeaders(request, env));

  const mirror = {
    version: 1,
    syncedAt: new Date().toISOString(),
    rangeStart: records[0]?.date ?? null,
    rangeEnd: records[records.length - 1]?.date ?? null,
    records,
    weeklyReviews: Array.isArray(payload?.weeklyReviews) ? payload.weeklyReviews.slice(-30) : [],
    postExertionalResponses: Array.isArray(payload?.postExertionalResponses) ? payload.postExertionalResponses.slice(-60) : [],
    clusterDecisions: Array.isArray(payload?.clusterDecisions) ? payload.clusterDecisions.slice(-60) : []
  };

  const encoded = JSON.stringify(mirror);
  if (encoded.length > 20_000_000) {
    return json({ error: "Personal OS mirror is too large" }, 413, corsHeaders(request, env));
  }

  await env.WHOOP_AUTH.put("personal-os-mirror", encoded);
  return json({
    ok: true,
    syncedAt: mirror.syncedAt,
    recordCount: records.length,
    rangeStart: mirror.rangeStart,
    rangeEnd: mirror.rangeEnd
  }, 200, corsHeaders(request, env));
}

function rpcResult(id, result) {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function rpcError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message }
  };
}

const MCP_TOOLS = [
  {
    name: "get_personal_os_status",
    description: "Get the sync status and available date range for the user's Personal Operating System data.",
    securitySchemes: [{ type: "oauth2", scopes: ["personal_os:read"] }],
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "get_personal_os_day",
    description: "Get the joined Personal Operating System record for one date, including the Daily Log, Capacity Building entry and WHOOP data when available.",
    securitySchemes: [{ type: "oauth2", scopes: ["personal_os:read"] }],
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format." }
      },
      required: ["date"],
      additionalProperties: false
    }
  },
  {
    name: "get_recent_personal_os",
    description: "Get the most recent joined Personal Operating System records. Use this for recent trends in sleep, recovery, energy, capacity, medication/caffeine, load, training, nutrition experiments and WHOOP.",
    securitySchemes: [{ type: "oauth2", scopes: ["personal_os:read"] }],
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "integer", minimum: 1, maximum: 60, description: "Number of recent days to return. Default 14." }
      },
      additionalProperties: false
    }
  },
  {
    name: "get_personal_os_window",
    description: "Get joined Personal Operating System records for a specific date range, up to 60 days.",
    securitySchemes: [{ type: "oauth2", scopes: ["personal_os:read"] }],
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Start date in YYYY-MM-DD format." },
        end_date: { type: "string", description: "End date in YYYY-MM-DD format." }
      },
      required: ["start_date", "end_date"],
      additionalProperties: false
    }
  }
];

async function loadMirror(env) {
  return env.WHOOP_AUTH.get("personal-os-mirror", "json");
}

function dateDiffDays(startDate, endDate) {
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

async function liveWhoopByDate(request, env, days) {
  try {
    const session = await loadSession(request, env);
    if (!session) return new Map();
    const accessToken = await ensureAccessToken(session, env);
    const payload = await getWhoopWindow(accessToken, Math.max(1, Math.min(90, days)));
    return new Map((payload.records || []).map((record) => [record.date, record]));
  } catch {
    return new Map();
  }
}

async function enrichedRecords(request, env, records) {
  if (!records.length) return records;
  const latest = records[records.length - 1]?.date;
  const today = new Date().toISOString().slice(0, 10);
  const daysBack = latest ? Math.min(90, Math.max(1, dateDiffDays(records[0].date, today))) : 1;
  const whoopByDate = await liveWhoopByDate(request, env, daysBack);
  return records.map((record) => ({
    ...record,
    whoop: whoopByDate.get(record.date) ?? record.whoop ?? null
  }));
}

async function callPersonalOsTool(request, env, name, args = {}) {
  const mirror = await loadMirror(env);
  if (!mirror) {
    return {
      content: [{ type: "text", text: "No Personal OS cloud mirror is available yet. Enable ChatGPT access in Capacity Building and sync the data first." }],
      isError: true
    };
  }

  const records = Array.isArray(mirror.records) ? mirror.records : [];

  if (name === "get_personal_os_status") {
    const result = {
      syncedAt: mirror.syncedAt ?? null,
      rangeStart: mirror.rangeStart ?? records[0]?.date ?? null,
      rangeEnd: mirror.rangeEnd ?? records[records.length - 1]?.date ?? null,
      recordCount: records.length,
      weeklyReviewCount: Array.isArray(mirror.weeklyReviews) ? mirror.weeklyReviews.length : 0,
      note: "WHOOP is refreshed live where possible when date records are requested."
    };
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }

  if (name === "get_personal_os_day") {
    const date = String(args.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { content: [{ type: "text", text: "date must be YYYY-MM-DD" }], isError: true };
    }
    const record = records.find((item) => item.date === date);
    if (!record) {
      return { content: [{ type: "text", text: `No Personal OS record is available for ${date}.` }], isError: true };
    }
    const enriched = await enrichedRecords(request, env, [record]);
    return { content: [{ type: "text", text: JSON.stringify(enriched[0]) }] };
  }

  if (name === "get_recent_personal_os") {
    const days = Math.max(1, Math.min(60, Number(args.days || 14)));
    const selected = records.slice(-days);
    const enriched = await enrichedRecords(request, env, selected);
    const result = {
      syncedAt: mirror.syncedAt,
      records: enriched,
      weeklyReviews: Array.isArray(mirror.weeklyReviews) ? mirror.weeklyReviews.slice(-10) : [],
      postExertionalResponses: Array.isArray(mirror.postExertionalResponses) ? mirror.postExertionalResponses.slice(-20) : []
    };
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }

  if (name === "get_personal_os_window") {
    const startDate = String(args.start_date || "");
    const endDate = String(args.end_date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return { content: [{ type: "text", text: "start_date and end_date must be YYYY-MM-DD" }], isError: true };
    }
    const span = dateDiffDays(startDate, endDate);
    if (span < 1 || span > 60) {
      return { content: [{ type: "text", text: "Date range must be between 1 and 60 days." }], isError: true };
    }
    const selected = records.filter((item) => item.date >= startDate && item.date <= endDate);
    const enriched = await enrichedRecords(request, env, selected);
    const result = {
      startDate,
      endDate,
      syncedAt: mirror.syncedAt,
      records: enriched,
      weeklyReviews: Array.isArray(mirror.weeklyReviews)
        ? mirror.weeklyReviews.filter((review) => review.weekStart >= startDate && review.weekStart <= endDate)
        : [],
      postExertionalResponses: Array.isArray(mirror.postExertionalResponses)
        ? mirror.postExertionalResponses.filter((item) => item.exposureDate >= startDate && item.exposureDate <= endDate)
        : []
    };
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }

  return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
}

async function handleMcp(request, env) {
  if (request.method !== "POST") {
    return json({ error: "MCP endpoint accepts POST requests" }, 405);
  }

  const body = await request.json();
  const id = body?.id;
  const method = body?.method;

  if (method === "notifications/initialized") {
    return new Response(null, { status: 202 });
  }

  if (method === "initialize") {
    return json(rpcResult(id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "personal-operating-system", version: "0.2.0" },
      instructions: "Read-only access to the user's Personal Operating System data. Use date-scoped tools and interpret patterns cautiously."
    }));
  }

  if (method === "ping") return json(rpcResult(id, {}));

  if (method === "tools/list") {
    return json(rpcResult(id, { tools: MCP_TOOLS }));
  }

  if (method === "tools/call") {
    const bearer = bearerToken(request);
    if (!(await isChatGPTKey(bearer, env))) {
      const challenge = `Bearer resource_metadata="${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/.well-known/oauth-protected-resource", scope="personal_os:read", error="insufficient_scope", error_description="Connect Personal Operating System to continue"`;
      return json(
        rpcResult(id, {
          content: [{ type: "text", text: "Authentication required to read Personal OS data." }],
          _meta: { "mcp/www_authenticate": [challenge] },
          isError: true
        }),
        401,
        { "WWW-Authenticate": challenge }
      );
    }

    const name = body?.params?.name;
    const args = body?.params?.arguments || {};
    if (!MCP_TOOLS.some((tool) => tool.name === name)) {
      return json(rpcError(id, -32602, "Unknown tool"));
    }
    const result = await callPersonalOsTool(request, env, name, args);
    return json(rpcResult(id, result));
  }

  return json(rpcError(id, -32601, "Method not found"));
}

async function handleDisconnect(request, env) {
  const session = await loadSession(request, env);
  if (!session) return json({ error: "Not authorised" }, 401, corsHeaders(request, env));

  try {
    const accessToken = await ensureAccessToken(session, env);
    await fetch(`${WHOOP_API}/user/access`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  } finally {
    await env.WHOOP_AUTH.delete(`session:${session.sessionId}`);
    const owner = await env.WHOOP_AUTH.get("owner-session");
    if (owner === session.sessionId) await env.WHOOP_AUTH.delete("owner-session");
  }

  return json({ disconnected: true }, 200, corsHeaders(request, env));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    try {
      if (url.pathname === "/health") {
        const clientId = String(env.WHOOP_CLIENT_ID || "").trim();
        return json({
          ok: true,
          service: "personal-os-whoop-bridge",
          whoopClientIdConfigured: Boolean(clientId),
          whoopClientIdFormatLooksValid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId),
          whoopClientSecretConfigured: Boolean(String(env.WHOOP_CLIENT_SECRET || "").trim())
        });
      }
      if (url.pathname === "/.well-known/oauth-protected-resource" && request.method === "GET") return json(protectedResourceMetadata(env));
      if (url.pathname === "/.well-known/oauth-authorization-server" && request.method === "GET") return json(oauthMetadata(env));
      if (url.pathname === "/oauth/chatgpt/authorize" && request.method === "GET") return handleChatGPTAuthorize(request, env);
      if (url.pathname === "/oauth/chatgpt/token" && request.method === "POST") return handleChatGPTToken(request, env);
      if (url.pathname === "/api/chatgpt-oauth/decision" && request.method === "POST") return handleChatGPTOAuthDecision(request, env);
      if (url.pathname === "/oauth/start" && request.method === "GET") return handleStart(request, env);
      if (url.pathname === "/oauth/callback" && request.method === "GET") return handleCallback(request, env);
      if (url.pathname === "/api/whoop" && request.method === "GET") return handleData(request, env);
      if (url.pathname === "/api/chatgpt-key" && ["GET", "POST", "DELETE"].includes(request.method)) return handleChatGPTKey(request, env);
      if (url.pathname === "/api/personal-os/sync" && request.method === "POST") return handleMirrorSync(request, env);
      if (url.pathname === "/api/disconnect" && request.method === "POST") return handleDisconnect(request, env);
      if (url.pathname === "/mcp") return handleMcp(request, env);
      return json({ error: "Not found" }, 404, corsHeaders(request, env));
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500, corsHeaders(request, env));
    }
  }
};
