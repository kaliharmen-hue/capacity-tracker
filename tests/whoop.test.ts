import test from 'node:test';
import assert from 'node:assert/strict';
import { sleepDetails, workoutDetails } from '../integrations/whoop-worker/src/whoop-normalise.js';
import worker from '../integrations/whoop-worker/src/index.js';

const ms = (minutes: number) => minutes * 60000;
const scored = {
  id: 'synthetic-sleep', cycle_id: 123, nap: false, score_state: 'SCORED',
  start: '2026-11-04T15:00:00Z', end: '2026-11-04T23:30:00Z', timezone_offset: '+02:00',
  score: {
    stage_summary: { total_rem_sleep_time_milli: ms(90), total_slow_wave_sleep_time_milli: ms(80), total_light_sleep_time_milli: ms(280), total_awake_time_milli: ms(60), total_in_bed_time_milli: ms(510), total_no_data_time_milli: 0, sleep_cycle_count: 4 },
    sleep_needed: { baseline_milli: ms(450), need_from_sleep_debt_milli: ms(40), need_from_recent_strain_milli: ms(20), need_from_recent_nap_milli: ms(-30) }
  }
};

test('sleep durations, zero no-data and signed sleep-need components are preserved', () => {
  const result = sleepDetails(scored);
  assert.equal(result.remSleepMinutes, 90);
  assert.equal(result.deepSleepMinutes, 80);
  assert.equal(result.awakeMinutes, 60);
  assert.equal(result.sleepHours, 7.5);
  assert.equal(result.sleepDebtMinutes, 40);
  assert.equal(result.sleepNeedFromNapMinutes, -30);
  assert.equal(result.sleepNeededMinutes, 480);
  assert.equal(result.noDataMinutes, 0);
  assert.equal(sleepDetails({ score: { stage_summary: { total_rem_sleep_time_milli: 0 } } }).remSleepMinutes, 0);
});

test('pending, unscorable and absent fields stay unknown, not zero', () => {
  for (const score_state of ['PENDING_SCORE', 'UNSCORABLE']) {
    const result = sleepDetails({ ...scored, score_state });
    assert.equal(result.sleepHours, null);
    assert.equal(result.sleepDebtMinutes, null);
    assert.equal(result.remSleepMinutes, null);
  }
  assert.equal(sleepDetails({}).sleepNeededMinutes, null);
  assert.equal(sleepDetails({ score: { stage_summary: { total_rem_sleep_time_milli: 0 } } }).sleepHours, null);
});

test('workout extra measurements preserve zero and convert heart-rate zone milliseconds', () => {
  const result = workoutDetails({ score_state: 'SCORED', score: { kilojoule: 400, distance_meter: 0, zone_durations: { zone_zero_milli: 0, zone_two_milli: ms(25) } } });
  assert.equal(result.distanceMeters, 0);
  assert.equal(result.zoneDurationMinutes['0'], 0);
  assert.equal(result.zoneDurationMinutes['2'], 25);
  assert.equal(result.zoneDurationMinutes['5'], null);
});

test('authenticated API and MCP retrieve fresh sleep stages on the local waking date without creating journal answers', async () => {
  const session = { access_token: 'synthetic', expires_at: Date.now() + 3600000 };
  const mirror = { records: [{ date: '2026-11-03', daily: { date: '2026-11-03', notes: 'Keep historical answer' } }], v2Entries: [] };
  const env = {
    PUBLIC_BASE_URL: 'https://worker.example', APP_ORIGIN: 'https://tracker.example/',
    WHOOP_AUTH: { async get(key: string) {
      if (key === 'session:owner') return session;
      if (key === 'owner-session') return 'owner';
      if (key === 'personal-os-mirror') return structuredClone(mirror);
      if (key === 'chatgpt-access:reader') return { expiresAt: Date.now() + 3600000, version: 1, resource: 'https://worker.example/mcp', scope: 'personal_os:read' };
      return null;
    } }
  };
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    const path = new URL(String(input)).pathname;
    return Response.json({ records: path.endsWith('/activity/sleep') ? [scored, { ...scored, id: 'nap', nap: true }] : [] });
  };
  try {
    const api = await worker.fetch(new Request('https://worker.example/api/whoop?days=30', { headers: { Authorization: 'Bearer owner' } }), env);
    const payload = await api.json();
    assert.equal(api.status, 200);
    assert.equal(payload.records.length, 1);
    assert.equal(payload.records[0].date, '2026-11-05');
    assert.equal(payload.records[0].remSleepMinutes, 90);
    for (const [name, args] of [
      ['get_personal_os_day', { date: '2026-11-05' }],
      ['get_personal_os_window', { start_date: '2026-11-03', end_date: '2026-11-05' }]
    ] as const) {
      const response = await worker.fetch(new Request('https://worker.example/mcp', { method: 'POST', headers: { Authorization: 'Bearer reader' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }), env);
      const rpc = await response.json();
      assert(!rpc.result.isError);
      const data = JSON.parse(rpc.result.content[0].text);
      const row = data.records ? data.records.find(item => item.date === '2026-11-05') : data;
      assert.equal(row.whoop.deepSleepMinutes, 80);
      assert.equal(row.whoop.awakeMinutes, 60);
      assert.equal(row.daily, null);
      assert.equal(row.capacity, null);
      if (data.records) assert.equal(data.records[0].daily.notes, 'Keep historical answer');
    }
    assert.equal(mirror.records.length, 1);
  } finally { globalThis.fetch = original; }
});
