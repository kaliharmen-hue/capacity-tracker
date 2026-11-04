async function post(bridge: string, path: string, body: object, session?: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
  const response = await fetch(bridge.replace(/\/$/, '') + '/api/whoop-connection/' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: 'Bearer ' + session } : {}) },
    body: JSON.stringify(body), signal: controller.signal
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Phone connection needs retrying.');
  return result;
  } finally { clearTimeout(timer); }
}

export async function issuePhoneConnectionCode(bridge: string, session: string) {
  const result = await post(bridge, 'code', {}, session);
  if (!/^[0-9a-f]{32}$/.test(result.code || '')) throw new Error('Invalid connection code returned.');
  return result.code as string;
}

export async function redeemPhoneConnectionCode(bridge: string, value: string) {
  const code = value.replace(/[\s-]/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(code)) throw new Error('Paste the full temporary connection code.');
  const result = await post(bridge, 'connect', { code });
  if (!/^[0-9a-f]{64}$/.test(result.session || '')) throw new Error('Invalid phone connection returned.');
  return result.session as string;
}
