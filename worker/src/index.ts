interface Env {
  POS_KV: KVNamespace;
  WHOOP_CLIENT_ID: string;
  WHOOP_CLIENT_SECRET: string;
  WHOOP_REDIRECT_URI: string;
  OPENAI_API_KEY: string;
  OPENAI_VISION_MODEL?: string;
  ALLOWED_ORIGIN: string;
  MAX_IMAGE_BYTES?: string;
}

const WHOOP_API = "https://api.prod.whoop.com/developer/v2";
const WHOOP_AUTH = "https://api.prod.whoop.com/oauth/oauth2";
const WHOOP_SCOPES = "offline read:sleep read:recovery read:cycles read:workout";

function headers(env: Env): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json"
  });
}

function json(env: Env, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(env) });
}

function cookieValue(request: Request, name: string): string | undefined {
  return request.headers.get("Cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function randomToken(): string {
  return crypto.randomUUID();
}

async function tokenFor(request: Request, env: Env): Promise<{ session: string; token: Record<string, unknown> } | undefined> {
  const session = cookieValue(request, "pos_session");
  if (!session) return undefined;
  const token = await env.POS_KV.get(`whoop:session:${session}`, "json") as Record<string, unknown> | null;
  return token ? { session, token } : undefined;
}

async function whoopFetch(request: Request, env: Env, path: string): Promise<Response> {
  const current = await tokenFor(request, env);
  if (!current) return json(env, { error: "WHOOP is not connected." }, 401);
  let accessToken = String(current.token.access_token || "");
  let response = await fetch(`${WHOOP_API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 401 && current.token.refresh_token) {
    const refreshed = await fetch(`${WHOOP_AUTH}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: String(current.token.refresh_token), client_id: env.WHOOP_CLIENT_ID, client_secret: env.WHOOP_CLIENT_SECRET })
    });
    if (refreshed.ok) {
      const refreshedToken = await refreshed.json() as Record<string, unknown>;
      await env.POS_KV.put(`whoop:session:${current.session}`, JSON.stringify({ ...current.token, ...refreshedToken }));
      accessToken = String(refreshedToken.access_token || accessToken);
      response = await fetch(`${WHOOP_API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    }
  }
  return response;
}

async function allWhoopRecords(request: Request, env: Env, endpoint: string, start: string, end: string): Promise<unknown[]> {
  const records: unknown[] = [];
  let nextToken = "";
  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({ limit: "25", start, end });
    if (nextToken) params.set("nextToken", nextToken);
    const response = await whoopFetch(request, env, `${endpoint}?${params}`);
    if (!response.ok) throw new Error(`WHOOP request failed with ${response.status}`);
    const pageData = await response.json() as { records?: unknown[]; next_token?: string };
    records.push(...(pageData.records ?? []));
    nextToken = pageData.next_token ?? "";
    if (!nextToken || !pageData.records?.length) break;
  }
  return records;
}

function normaliseRecord(recordType: string, raw: any, syncedAt: string): Record<string, unknown> {
  const score = raw.score ?? {};
  const stages = score.stage_summary ?? {};
  return {
    recordKey: `${recordType}:${raw.id ?? raw.cycle_id ?? crypto.randomUUID()}`,
    recordType,
    date: String(raw.start ?? raw.created_at ?? "").slice(0, 10),
    start: raw.start ?? raw.created_at ?? "",
    end: raw.end ?? "",
    scoreState: raw.score_state ?? "UNSCORED",
    source: "whoop-api",
    syncedAt,
    metrics: {
      sleepHours: stages.total_in_bed_time_milli ? stages.total_in_bed_time_milli / 3600000 : null,
      awakeHours: stages.total_awake_time_milli ? stages.total_awake_time_milli / 3600000 : null,
      lightSleepHours: stages.total_light_sleep_time_milli ? stages.total_light_sleep_time_milli / 3600000 : null,
      deepSleepHours: stages.total_slow_wave_sleep_time_milli ? stages.total_slow_wave_sleep_time_milli / 3600000 : null,
      remSleepHours: stages.total_rem_sleep_time_milli ? stages.total_rem_sleep_time_milli / 3600000 : null,
      disturbanceCount: stages.disturbance_count ?? null,
      sleepNeedHours: score.sleep_needed?.baseline_milli ? score.sleep_needed.baseline_milli / 3600000 : null,
      sleepPerformancePercentage: score.sleep_performance_percentage ?? null,
      sleepEfficiencyPercentage: score.sleep_efficiency_percentage ?? null,
      sleepConsistencyPercentage: score.sleep_consistency_percentage ?? null,
      respiratoryRate: score.respiratory_rate ?? null,
      recoveryScore: score.recovery_score ?? null,
      hrvRmssdMs: score.hrv_rmssd_milli ?? null,
      restingHeartRate: score.resting_heart_rate ?? null,
      spo2Percentage: score.spo2_percentage ?? null,
      skinTempCelsius: score.skin_temp_celsius ?? null,
      strain: score.strain ?? raw.strain ?? null,
      kilojoule: score.kilojoule ?? raw.kilojoule ?? null,
      averageHeartRate: score.average_heart_rate ?? raw.average_heart_rate ?? null,
      maxHeartRate: score.max_heart_rate ?? raw.max_heart_rate ?? null,
      stepCount: raw.score?.step_count ?? raw.step_count ?? null
    }
  };
}

async function whoopSync(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { start?: string; end?: string };
  const start = body.start || new Date(Date.now() - 90 * 86400000).toISOString();
  const end = body.end || new Date().toISOString();
  const syncedAt = new Date().toISOString();
  const [sleeps, recoveries, cycles, workouts] = await Promise.all([
    allWhoopRecords(request, env, "/activity/sleep", start, end),
    allWhoopRecords(request, env, "/recovery", start, end),
    allWhoopRecords(request, env, "/cycle", start, end),
    allWhoopRecords(request, env, "/activity/workout", start, end)
  ]);
  return json(env, { syncedAt, records: [...sleeps.map((item) => normaliseRecord("sleep", item, syncedAt)), ...recoveries.map((item) => normaliseRecord("recovery", item, syncedAt)), ...cycles.map((item) => normaliseRecord("cycle", item, syncedAt)), ...workouts.map((item) => normaliseRecord("workout", item, syncedAt))] });
}

const mealSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    time: { type: "string" }, ingredients: { type: "string" }, portions: { type: "string" },
    calories: { type: ["number", "string"] }, proteinGrams: { type: ["number", "string"] },
    carbohydrateGrams: { type: ["number", "string"] }, fatGrams: { type: ["number", "string"] }, confidence: { type: "string" }, note: { type: "string" }
  },
  required: ["time", "ingredients", "portions", "calories", "proteinGrams", "carbohydrateGrams", "fatGrams", "confidence", "note"]
};

async function analyseFood(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { imageDataUrl?: string; mealDate?: string; mealTime?: string; note?: string; consent?: boolean };
  if (body.consent !== true || !body.imageDataUrl?.startsWith("data:image/")) return json(env, { error: "Image consent and a valid image are required." }, 400);
  if (body.imageDataUrl.length > Number(env.MAX_IMAGE_BYTES || 8388608) * 1.4) return json(env, { error: "Image is too large." }, 413);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_VISION_MODEL || "gpt-4o-mini",
      input: [{ role: "user", content: [
        { type: "input_text", text: `Analyse this meal photo for ${body.mealDate || "the recorded date"}. The user note is: ${body.note || "none"}. Identify only likely visible ingredients and clearly label uncertainty. Estimate a plausible portion description and approximate nutrition. Do not infer hidden ingredients, allergies, intolerance or medical effects. Return one JSON object matching the supplied schema.` },
        { type: "input_image", image_url: body.imageDataUrl }
      ]}],
      text: { format: { type: "json_schema", name: "meal_estimate", strict: true, schema: mealSchema } }
    })
  });
  if (!response.ok) return json(env, { error: "The configured AI service could not analyse this image." }, 502);
  const result = await response.json() as { output_text?: string };
  try {
    return json(env, { meal: JSON.parse(result.output_text || "{}") });
  } catch {
    return json(env, { error: "The AI returned an unreadable meal estimate." }, 502);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(env) });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/whoop/connect") {
        const state = randomToken();
        await env.POS_KV.put(`whoop:state:${state}`, "1", { expirationTtl: 600 });
        const auth = new URL(`${WHOOP_AUTH}/auth`);
        auth.searchParams.set("response_type", "code"); auth.searchParams.set("client_id", env.WHOOP_CLIENT_ID); auth.searchParams.set("redirect_uri", env.WHOOP_REDIRECT_URI); auth.searchParams.set("scope", WHOOP_SCOPES); auth.searchParams.set("state", state);
        return Response.redirect(auth.toString(), 302);
      }
      if (url.pathname === "/whoop/callback") {
        const state = url.searchParams.get("state") || "";
        const code = url.searchParams.get("code") || "";
        if (!state || !code || !(await env.POS_KV.get(`whoop:state:${state}`))) return new Response("Invalid WHOOP OAuth state", { status: 400 });
        await env.POS_KV.delete(`whoop:state:${state}`);
        const tokenResponse = await fetch(`${WHOOP_AUTH}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: env.WHOOP_REDIRECT_URI, client_id: env.WHOOP_CLIENT_ID, client_secret: env.WHOOP_CLIENT_SECRET }) });
        if (!tokenResponse.ok) return new Response("WHOOP token exchange failed", { status: 502 });
        const session = randomToken();
        await env.POS_KV.put(`whoop:session:${session}`, JSON.stringify(await tokenResponse.json()));
        return new Response("WHOOP connected. You can close this window and return to Personal OS V2.", { headers: { "Content-Type": "text/plain", "Set-Cookie": `pos_session=${session}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` } });
      }
      if (url.pathname === "/whoop/status") return json(env, { connected: Boolean(await tokenFor(request, env)) });
      if (url.pathname === "/whoop/sync" && request.method === "POST") return whoopSync(request, env);
      if (url.pathname === "/food/analyse" && request.method === "POST") return analyseFood(request, env);
      return json(env, { error: "Not found" }, 404);
    } catch (error) {
      return json(env, { error: error instanceof Error ? error.message : "Request failed" }, 500);
    }
  }
};

