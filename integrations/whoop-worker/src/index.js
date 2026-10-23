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

function appOrigin(env) {
  return new URL(env.APP_ORIGIN).origin;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (origin && origin === appOrigin(env)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
  const header = request.headers.get("Authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!bearer) return null;

  if (env.CHATGPT_API_KEY && bearer === env.CHATGPT_API_KEY) {
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
      if (url.pathname === "/health") return json({ ok: true, service: "personal-os-whoop-bridge" });
      if (url.pathname === "/oauth/start" && request.method === "GET") return handleStart(request, env);
      if (url.pathname === "/oauth/callback" && request.method === "GET") return handleCallback(request, env);
      if (url.pathname === "/api/whoop" && request.method === "GET") return handleData(request, env);
      if (url.pathname === "/api/disconnect" && request.method === "POST") return handleDisconnect(request, env);
      return json({ error: "Not found" }, 404, corsHeaders(request, env));
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500, corsHeaders(request, env));
    }
  }
};
