// Copyright (c) 2026 Mrinal. Provider calls are mocked; no Google requests leave these tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NavigationAI } from '../server/navigation-ai.js';

const KEY = 'fixture-secret-api-key';
const models = ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'];
const input = { stage: 'Open Edit info', controls: [{ label: 'Edit', resourceId: 'com.instagram.android:id/edit', clickable: true, scrollable: false }] };
const success = (steps = ['Tap Edit in the open menu.']) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ steps }) }] } }] }), { status: 200 });
const failure = (status, body = {}, headers = {}) => new Response(JSON.stringify(body), { status, headers });
async function fixture(t, fetchImpl, env = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-navigation-ai-'));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  let clock = Date.parse('2026-10-24T12:00:00Z');
  const calls = [];
  const fetcher = async (...args) => { calls.push(args); return fetchImpl(...args); };
  const ai = new NavigationAI({ dataDir, fetchImpl: fetcher, now: () => clock, env });
  await ai.init();
  return { ai, calls, dataDir, advance: ms => { clock += ms; }, now: () => clock, fetcher };
}
async function enabled(t, fetchImpl = () => success(), env) {
  const f = await fixture(t, fetchImpl, env);
  await f.ai.configure({ enabled: true, apiKey: KEY });
  return f;
}

test('navigation AI is opt-in, requires a key, and keeps secrets out of public state', async t => {
  const f = await fixture(t, () => { throw new Error('Unexpected provider call'); });
  assert.equal(f.ai.state().enabled, false); assert.equal(f.ai.state().status, 'disabled');
  assert.equal(await f.ai.suggest(input), null);
  await f.ai.configure({ enabled: true });
  assert.equal(f.ai.state().status, 'config_needed'); assert.equal(await f.ai.suggest(input), null);
  await f.ai.configure({ apiKey: KEY });
  const state = f.ai.state();
  assert.equal(state.provider, 'gemini'); assert.equal(state.configured, true); assert.equal(state.keySource, 'local');
  assert.equal(state.today.remaining, 10); assert.deepEqual(state.models, models);
  assert(!JSON.stringify(state).includes(KEY)); assert.equal(f.calls.length, 0);
  await assert.rejects(f.ai.configure({ enabled: 'true' }), /whether/);
  await assert.rejects(f.ai.configure({ apiKey: 'bad key' }), /valid Gemini/);
});

test('settings persist locally; an environment key overrides local settings without being persisted', async t => {
  const f = await enabled(t, () => success(), { GEMINI_API_KEY: 'environment-secret-key' });
  assert.equal(f.ai.state().keySource, 'environment');
  await f.ai.suggest(input);
  assert.equal(f.calls[0][1].headers['x-goog-api-key'], 'environment-secret-key');
  const disk = await fs.readFile(path.join(f.dataDir, 'navigation-ai.json'), 'utf8');
  assert(disk.includes(KEY)); assert(!disk.includes('environment-secret-key'));
  const restored = new NavigationAI({ dataDir: f.dataDir, fetchImpl: f.fetcher, now: f.now, env: {} });
  await restored.init(); assert.equal(restored.state().enabled, true); assert.equal(restored.state().configured, true); assert.equal(restored.state().today.used, 1);
  await restored.configure({ clearKey: true }); assert.equal(restored.state().configured, false);
  assert(!JSON.stringify(restored.state()).includes(KEY));
  const envOnly = new NavigationAI({ dataDir: f.dataDir, fetchImpl: f.fetcher, now: f.now, env: { GEMINI_API_KEY: 'environment-secret-key' } });
  await envOnly.init(); await envOnly.configure({ clearKey: true }); assert.equal(envOnly.state().keySource, 'environment');
});

test('requests use a header key, bounded text-only data, structured output and cached advisory results', async t => {
  const f = await enabled(t);
  const value = await f.ai.suggest({ ...input, controls: [{ ...input.controls[0], screenshot: 'PRIVATE_IMAGE', untrustedExtra: 'SECRET_EXTRA' }] });
  assert.deepEqual(value, { steps: ['Tap Edit in the open menu.'], model: models[0] });
  const [url, request] = f.calls[0];
  assert.equal(url, `https://generativelanguage.googleapis.com/v1beta/models/${models[0]}:generateContent`);
  assert(!url.includes(KEY)); assert.equal(request.headers['x-goog-api-key'], KEY); assert.equal(request.method, 'POST');
  assert(request.signal instanceof AbortSignal);
  const payload = JSON.parse(request.body);
  assert.equal(payload.generationConfig.maxOutputTokens, 256); assert.equal(payload.generationConfig.candidateCount, 1);
  assert.equal(payload.generationConfig.responseMimeType, 'application/json');
  assert(!request.body.includes('PRIVATE_IMAGE')); assert(!request.body.includes('SECRET_EXTRA')); assert(!request.body.includes('inlineData'));
  const cachedInput = { ...input, controls: [{ ...input.controls[0] }] };
  value.steps[0] = 'Tampered';
  assert.deepEqual(await f.ai.suggest(cachedInput), { steps: ['Tap Edit in the open menu.'], model: models[0] });
  assert.equal(f.calls.length, 1); assert.equal(f.ai.state().today.used, 1);
  await f.ai.configure({ enabled: false }); assert.equal(await f.ai.suggest(input), null); assert.equal(f.calls.length, 1);
});

test('provider output is strict JSON and never returns publication, credential, recipient or command instructions', async t => {
  const invalid = [
    { steps: ['Tap Share.'] }, { steps: ['Tap Done.'] }, { steps: ['Tap Apply.'] }, { steps: ['Tap Ｓａｖｅ.'] }, { steps: ['Tap Your stories.'] },
    { steps: ['Select Close Friends.'] }, { steps: ['Open password settings.'] },
    { steps: ['Open https://example.com/'] }, { steps: ['Tap 400, 500.'] },
    { steps: ['Run adb shell.'] }, { steps: ['Tap Edit.'], command: 'tap' },
    { steps: [42] }, { steps: ['Tap Edit.', 'Scroll down.', 'Open Music.', 'Tap Done.'] },
    { steps: ['Tap ' + 'x'.repeat(180)] }, { steps: [] }
  ];
  for (const decoded of invalid) {
    const f = await enabled(t, () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(decoded) }] } }] }), { status: 200 }));
    assert.equal(await f.ai.suggest(input), null, JSON.stringify(decoded)); assert.equal(f.calls.length, 1);
  }
});

test('malformed, truncated and non-JSON provider responses degrade to manual navigation', async t => {
  for (const body of [
    '<html>Proxy failure</html>',
    JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"steps":["Tap Edit."]}' }] } }] }),
    JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '```json\n{"steps":["Tap Edit."]}\n```' }] } }] }),
    'x'.repeat(65537)
  ]) {
    const f = await enabled(t, () => new Response(body, { status: 200 }));
    assert.equal(await f.ai.suggest(input), null); assert.equal(f.calls.length, 1); assert(!f.ai.state().message.includes(body));
  }
});

test('requests are separated by 30 seconds and constrained to two per rolling minute', async t => {
  const f = await enabled(t);
  assert(await f.ai.suggest(input));
  f.advance(29999); assert.equal(await f.ai.suggest({ ...input, stage: 'Open Music' }), null); assert.equal(f.calls.length, 1);
  f.advance(1); assert(await f.ai.suggest({ ...input, stage: 'Open Music' })); assert.equal(f.calls.length, 2);
  f.advance(1000); assert.equal(await f.ai.suggest({ ...input, stage: 'Open library' }), null); assert.equal(f.calls.length, 2);
  assert(f.ai.state().cooldownUntil >= f.now());
  f.advance(30001); assert(await f.ai.suggest({ ...input, stage: 'Open library' })); assert.equal(f.calls.length, 3);
});

test('daily budget persists before provider calls and across restart, then resets at midnight UTC', async t => {
  let f;
  f = await enabled(t, async () => {
    const disk = JSON.parse(await fs.readFile(path.join(f.dataDir, 'navigation-ai.json'), 'utf8'));
    assert.equal(disk.usage.used, f.calls.length, 'Submission budget is durable before the request');
    return success();
  });
  for (let n = 0; n < 10; n++) { assert(await f.ai.suggest({ ...input, stage: `Navigation stage ${n}` })); f.advance(60001); }
  assert.equal(f.ai.state().today.remaining, 0); assert.equal(f.ai.state().status, 'daily_limit');
  assert.equal(await f.ai.suggest({ ...input, stage: 'Another stage' }), null); assert.equal(f.calls.length, 10);
  const restored = new NavigationAI({ dataDir: f.dataDir, fetchImpl: f.fetcher, now: f.now, env: {} }); await restored.init();
  assert.equal(restored.state().today.used, 10); assert.equal(await restored.suggest(input), null); assert.equal(f.calls.length, 10);
  f.advance(86400000); assert.equal(restored.state().today.remaining, 10);
  // Use a new mock after reset; the durable count is now one rather than the old call-list length.
  restored.fetch = async () => success(); assert(await restored.suggest(input)); assert.equal(restored.state().today.used, 1);
});

test('an identical screen consumes at most two model calls per UTC day even after cache expiry/restart', async t => {
  const f = await enabled(t);
  assert(await f.ai.suggest(input)); f.advance(31 * 60000);
  assert(await f.ai.suggest(input)); f.advance(31 * 60000);
  const restored = new NavigationAI({ dataDir: f.dataDir, fetchImpl: f.fetcher, now: f.now, env: {} }); await restored.init();
  assert.equal(await restored.suggest(input), null); assert.equal(f.calls.length, 2);
});

test('a busy or unsupported model switches once, with every model call counted', async t => {
  for (const status of [500, 503, 404]) {
    let count = 0;
    const f = await enabled(t, () => ++count === 1 ? failure(status, { error: { message: KEY } }) : success(['Scroll down in the open menu.']));
    const result = await f.ai.suggest(input);
    assert.equal(result.model, models[1]); assert.equal(f.calls.length, 2); assert.equal(f.ai.state().today.used, 2);
    assert(!JSON.stringify(f.ai.state()).includes(KEY));
    assert.equal(f.calls[1][0], `https://generativelanguage.googleapis.com/v1beta/models/${models[1]}:generateContent`);
  }
});

test('two busy models never loop to a third; cooldown persists on restart', async t => {
  const f = await enabled(t, () => failure(503, { error: { message: KEY } }));
  assert.equal(await f.ai.suggest(input), null); assert.equal(f.calls.length, 2);
  assert.equal(f.ai.state().status, 'cooldown'); assert(f.ai.state().cooldownUntil > f.now());
  const restored = new NavigationAI({ dataDir: f.dataDir, fetchImpl: f.fetcher, now: f.now, env: {} }); await restored.init();
  assert.equal(await restored.suggest({ ...input, stage: 'Different navigation' }), null); assert.equal(f.calls.length, 2);
});

test('shared 429 quota errors do not evade a project limit by changing models', async t => {
  const f = await enabled(t, () => failure(429, { error: { message: KEY, details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '120s' }] } }, { 'Retry-After': '180' }));
  assert.equal(await f.ai.suggest(input), null); assert.equal(f.calls.length, 1); assert.equal(f.ai.state().today.used, 1);
  assert.equal(f.ai.state().cooldownUntil, f.now() + 180000); assert(!JSON.stringify(f.ai.state()).includes(KEY));
});

test('429 fallback is allowed only for explicit current-model quota dimensions, never daily quota', async t => {
  const modelLimit = daily => ({ error: { message: daily ? 'Requests per day exceeded' : 'Requests per minute exceeded', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: daily ? 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' : 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', quotaDimensions: { model: models[0] } }] }] } });
  let count = 0;
  const perModel = await enabled(t, () => ++count === 1 ? failure(429, modelLimit(false)) : success());
  assert.equal((await perModel.ai.suggest(input)).model, models[1]); assert.equal(perModel.calls.length, 2);
  const daily = await enabled(t, () => failure(429, modelLimit(true)));
  assert.equal(await daily.ai.suggest(input), null); assert.equal(daily.calls.length, 1); assert.equal(daily.ai.state().status, 'daily_limit'); assert(daily.ai.state().cooldownUntil > daily.now());
});

test('Retry-After backoff is capped and HTTP date values are understood', async t => {
  const huge = await enabled(t, () => failure(429, {}, { 'Retry-After': '999999999' }));
  await huge.ai.suggest(input); assert.equal(huge.ai.state().cooldownUntil, huge.now() + 3600000);
  let f;
  f = await enabled(t, () => failure(429, {}, { 'Retry-After': new Date(f.now() + 240000).toUTCString() }));
  await f.ai.suggest(input); assert.equal(f.ai.state().cooldownUntil, f.now() + 240000);
});

test('invalid key, network failures and malformed errors are friendly and never throw into the job', async t => {
  for (const fetcher of [() => failure(403, { error: { message: KEY } }), () => { throw new Error(`Network leaked ${KEY}`); }, () => new Response('upstream unavailable ' + KEY, { status: 502 })]) {
    const f = await enabled(t, fetcher); assert.equal(await f.ai.suggest(input), null); assert.equal(f.calls.length, 1);
    assert(!JSON.stringify(f.ai.state()).includes(KEY)); assert.equal(f.ai.state().today.used, 1);
  }
});

test('single in-flight request and abort never start an alternative model', async t => {
  let release;
  const f = await enabled(t, () => new Promise(resolve => { release = resolve; }));
  const controller = new AbortController();
  const pending = f.ai.suggest({ ...input, signal: controller.signal });
  while (!release) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(f.ai.state().status, 'busy');
  assert.equal(await f.ai.suggest({ ...input, stage: 'Other screen' }), null); assert.equal(f.calls.length, 1);
  controller.abort(); assert.equal(await pending, null); assert.equal(f.calls[0][1].signal.aborted, true);
  release(failure(503)); await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(f.calls.length, 1);
  const stopped = new AbortController(); stopped.abort(); assert.equal(await f.ai.suggest({ ...input, signal: stopped.signal }), null); assert.equal(f.calls.length, 1);
});

test('turning suggestions off during a request discards the result and prevents fallback', async t => {
  let release;
  const f = await enabled(t, () => new Promise(resolve => { release = resolve; }));
  const pending = f.ai.suggest(input);
  while (!release) await new Promise(resolve => setTimeout(resolve, 5));
  await f.ai.configure({ enabled: false }); release(failure(503));
  assert.equal(await pending, null); assert.equal(f.calls.length, 1); assert.equal(f.ai.state().status, 'disabled');
});


test('only bounded structured controls are sent; empty or arbitrary plain text never consumes a call', async t => {
  const f = await enabled(t);
  assert.equal(await f.ai.suggest({stage:'Open Edit info',controls:[]}),null);
  assert.equal(await f.ai.suggest({stage:'Open Edit info',controls:['arbitrary pasted document']}),null);
  assert.equal(f.calls.length,0);
  const controls=Array.from({length:100},()=>({label:'x'.repeat(1000),image:'private'}));
  assert(await f.ai.suggest({stage:'s'.repeat(1000),controls}));
  const request=JSON.parse(f.calls[0][1].body);const sent=JSON.parse(request.contents[0].parts[0].text);
  assert.equal(sent.stage.length,120);assert.equal(sent.controls.length,40);assert.equal(sent.controls[0].label.length,180);assert.equal(sent.controls[0].image,undefined);
});

test('a non-responsive provider is aborted after eight seconds without another model call', async t => {
  let started;const f=await enabled(t,()=>new Promise(resolve=>{started=true}));
  t.mock.timers.enable({apis:['setTimeout']});
  const pending=f.ai.suggest(input);
  // Wait for durable budget persistence to finish before advancing only the provider timer.
  while(!started) await new Promise(resolve=>setImmediate(resolve));
  t.mock.timers.tick(8000);
  assert.equal(await pending,null);assert.equal(f.calls.length,1);assert.equal(f.calls[0][1].signal.aborted,true);
  assert.equal(f.ai.state().status,'offline');
  t.mock.timers.reset();
});

test('Google daily quota cooldown follows Pacific midnight in winter, summer and DST transitions', async t => {
  const dailyError = { error: { message: 'Requests per day exceeded', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaDimensions: { model: models[0] } }] }] } };
  for (const [start, reset] of [
    ['2026-01-15T23:00:00Z', '2026-01-16T08:00:00Z'],
    ['2026-07-15T23:00:00Z', '2026-07-16T07:00:00Z'],
    ['2026-03-08T08:00:00Z', '2026-03-09T07:00:00Z'],
    ['2026-11-01T07:00:00Z', '2026-11-02T08:00:00Z']
  ]) {
    const f = await enabled(t, () => failure(429, dailyError));
    f.advance(Date.parse(start) - f.now());
    assert.equal(await f.ai.suggest(input), null);
    assert.equal(f.ai.state().cooldownUntil, Date.parse(reset), start);
    assert.equal(f.calls.length, 1, 'A daily provider limit never switches to another model');
    const studioReset = Date.parse(start.slice(0, 10)) + 86400000;
    assert.equal(f.ai.state().today.resetAt, studioReset, 'The separate Studio daily budget remains UTC');
    f.advance(studioReset + 1 - f.now());
    assert.equal(await f.ai.suggest({ ...input, stage: 'Different navigation' }), null);
    assert.equal(f.calls.length, 1, 'UTC rollover cannot bypass the still-active Pacific provider cooldown');
  }
});

test('only Gemini 2.5 Flash explicitly disables thinking; Lite defaults and small output cap are preserved', async t => {
  const f = await enabled(t, url => url.includes('/gemini-2.5-flash:') ? success() : failure(404));
  assert.equal(await f.ai.suggest(input), null);
  assert.equal(f.calls.length, 2);
  f.advance(60001);
  assert.equal((await f.ai.suggest({ ...input, stage: 'Open music library' })).model, models[2]);
  assert.equal(f.calls.length, 3);
  const configs = f.calls.map(([, request]) => JSON.parse(request.body).generationConfig);
  assert.equal(configs[0].thinkingConfig, undefined, '3.5 Flash-Lite already defaults to minimal thinking');
  assert.equal(configs[1].thinkingConfig, undefined, '2.5 Flash-Lite already defaults to thinking off');
  assert.deepEqual(configs[2].thinkingConfig, { thinkingBudget: 0 }, '2.5 Flash supports disabling default dynamic thinking');
  assert(configs.every(config => config.maxOutputTokens === 256));
});

const planInput = { platform: 'linkedin', stage: 'open_composer', controls: [
  { id: 'c1', label: 'Start a post', role: 'button', enabled: true, scrollable: false },
  { id: 'c2', label: 'Composer tools', role: 'scroll_region', enabled: true, scrollable: true }
] };
const planned = (action = { type: 'click', controlId: 'c1' }, extra = {}) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ action, ...extra }) }] } }] }), { status: 200 });
async function automatic(t, fetchImpl = () => planned()) {
  const f = await enabled(t, fetchImpl); await f.ai.configure({ automatic: true }); return f;
}

test('automatic recovery is separately opt-in, requires enabled help and persists without resetting budgets', async t => {
  const f = await fixture(t, () => planned());
  assert.equal(f.ai.state().automatic, false);
  await assert.rejects(f.ai.configure({ automatic: true }), /Enable AI/);
  await assert.rejects(f.ai.configure({ automatic: 'true' }), /automatic/);
  assert.equal(await f.ai.plan(planInput), null);
  await f.ai.configure({ enabled: true, apiKey: KEY });
  assert.equal(await f.ai.plan(planInput), null); assert.equal(f.calls.length, 0);
  await f.ai.configure({ automatic: true }); assert.equal(f.ai.state().automatic, true);
  assert(await f.ai.plan(planInput)); assert.equal(f.ai.state().today.used, 1);
  const restored = new NavigationAI({ dataDir: f.dataDir, fetchImpl: f.fetcher, now: f.now, env: {} });
  await restored.init(); assert.equal(restored.state().automatic, true); assert.equal(restored.state().today.used, 1);
  await restored.configure({ enabled: false }); assert.equal(restored.state().automatic, false);
  assert.equal(await restored.plan(planInput), null); assert.equal(restored.state().today.used, 1);
  await assert.rejects(restored.configure({ enabled: false, automatic: true }), /Enable AI/);
});

test('automatic planner sends only bounded controls and returns one safe ID-bound action with cache isolation', async t => {
  const f = await automatic(t);
  const requestInput = { ...planInput, screenshot: 'PRIVATE_SCREENSHOT', error: 'PRIVATE_ERROR', controls: planInput.controls.map(control => ({ ...control, selector: '#private', bounds: [1,2,3,4], caption: 'PRIVATE_CAPTION' })) };
  const result = await f.ai.plan(requestInput);
  assert.deepEqual(result, { fix: 'Open Start a post.', action: { type: 'click', controlId: 'c1' }, model: models[0] });
  const payload = JSON.parse(f.calls[0][1].body);
  assert.deepEqual(JSON.parse(payload.contents[0].parts[0].text), planInput);
  assert(payload.systemInstruction.parts[0].text.includes('untrusted UI data'));
  assert(payload.generationConfig.responseSchema.properties.action);
  assert(!f.calls[0][1].body.includes('PRIVATE_')); assert(!f.calls[0][1].body.includes('#private'));
  result.action.controlId = 'c39'; assert.equal((await f.ai.plan(planInput)).action.controlId, 'c1');
  assert.equal(f.calls.length, 1);
  // Advisory results cannot accidentally be reused as automatic plans.
  assert.equal(await f.ai.suggest(input), null); assert.equal(f.calls.length, 1);
  f.advance(30001); f.ai.fetch = async (...args) => { f.calls.push(args); return success(); };
  assert(await f.ai.suggest(input)); assert.equal(f.calls.length, 2);
});

test('automatic planner removes publishing, credentials, URLs and code labels before provider input', async t => {
  const f = await automatic(t);
  const controls = ['Post', 'Publish', 'Save', 'Your stories', 'Ｓｈａｒｅ', 'Delete', 'Send', 'Log in', 'Confirm', 'Go Live', 'Open https://unsafe.example', 'execute script', 'Tap 300, 400', 'x'.repeat(101)].map((label, index) => ({ id: `c${index + 3}`, label, role: 'button', enabled: true, scrollable: false }));
  assert(await f.ai.plan({ ...planInput, controls: [...planInput.controls, ...controls] }));
  const sent = JSON.parse(JSON.parse(f.calls[0][1].body).contents[0].parts[0].text);
  assert.deepEqual(sent.controls, planInput.controls);
});

test('invalid automatic navigation contexts and empty or forbidden-only controls do not use quota', async t => {
  const f = await automatic(t);
  for (const value of [
    { ...planInput, platform: 'other' }, { ...planInput, stage: 'Error: secret raw runtime failure' },
    { ...planInput, stage: 'a'.repeat(81) }, { ...planInput, controls: [planInput.controls[0], planInput.controls[0]] }, { ...planInput, controls: [] }, { ...planInput, controls: ['Edit'] },
    { ...planInput, controls: [{ id: 'c1', label: 'Post', role: 'button', enabled: true, scrollable: false }] },
    { ...planInput, controls: [{ id: 'selector', label: 'Edit', role: 'button', enabled: true, scrollable: false }] },
    { ...planInput, controls: [{ id: 'c41', label: 'Edit', role: 'button', enabled: true, scrollable: false }] },
    { ...planInput, controls: [{ id: 'c1', label: 'Edit', role: 'textbox', enabled: true, scrollable: false }] }
  ]) assert.equal(await f.ai.plan(value), null);
  assert.equal(f.calls.length, 0); assert.equal(f.ai.state().today.used, 0);
});

test('strict automatic actions reject invented IDs, unsupported fields, disabled controls and unsafe scrolls', async t => {
  for (const [action, extra] of [
    [{ type: 'click', controlId: 'c39' }], [{ type: 'click', controlId: 'c2' }],
    [{ type: 'click', controlId: 'c1', x: 10 }], [{ type: 'click', controlId: 'c1', selector: '#button' }],
    [{ type: 'click', controlId: 'c1' }, { command: 'extra' }],
    [{ type: 'scroll', controlId: 'c1', direction: 'down' }],
    [{ type: 'scroll', controlId: 'c2', direction: 'left' }],
    [{ type: 'wait', milliseconds: 5000 }], [{ type: 'stop', controlId: 'c1' }],
    [{ type: 'shell', command: 'tap' }], [[{ type: 'wait' }]]
  ]) {
    const f = await automatic(t, () => planned(action, extra));
    assert.equal(await f.ai.plan(planInput), null, JSON.stringify({action, extra}));
    assert.equal(f.calls.length, 1);
  }
  const disabled = await automatic(t);
  assert.equal(await disabled.ai.plan({ ...planInput, controls: planInput.controls.map(control => ({ ...control, enabled: false })) }), null);
  assert.equal(disabled.calls.length, 0, 'Disabled-only screens consume no quota');
});

test('automatic planner allows scoped scroll, bounded wait and explicit stop outcomes', async t => {
  for (const action of [{ type: 'scroll', controlId: 'c2', direction: 'down' }, { type: 'scroll', controlId: 'c2', direction: 'up' }, { type: 'wait' }, { type: 'stop' }]) {
    const f = await automatic(t, () => planned(action));
    assert.deepEqual((await f.ai.plan(planInput)).action, action);
  }
});

test('automatic and advisory calls share rate limits, durable daily quota and failure cooldowns', async t => {
  const f = await automatic(t, url => planned());
  assert(await f.ai.plan(planInput));
  assert.equal(await f.ai.suggest(input), null); assert.equal(f.calls.length, 1);
  f.advance(30001); f.ai.fetch = async (...args) => { f.calls.push(args); return success(); };
  assert(await f.ai.suggest(input)); assert.equal(f.ai.state().today.used, 2);
  await f.ai.configure({ automatic: false }); await f.ai.configure({ automatic: true });
  assert.equal(f.ai.state().today.used, 2); assert.equal(await f.ai.plan({ ...planInput, stage: 'other_stage' }), null);
  assert.equal(f.calls.length, 2);
  const busy = await automatic(t, () => failure(503));
  assert.equal(await busy.ai.plan(planInput), null); assert.equal(busy.calls.length, 2);
  assert.equal(await busy.ai.suggest(input), null); assert.equal(busy.calls.length, 2);
});

test('automatic planner switches once on a busy model but never bypasses shared provider quota', async t => {
  let count = 0;
  const f = await automatic(t, () => ++count === 1 ? failure(503) : planned());
  assert.equal((await f.ai.plan(planInput)).model, models[1]); assert.equal(f.calls.length, 2);
  const quota = await automatic(t, () => failure(429));
  assert.equal(await quota.ai.plan(planInput), null); assert.equal(quota.calls.length, 1);
  assert.equal(await quota.ai.suggest(input), null); assert.equal(quota.calls.length, 1);
});

test('disabling automatic recovery in flight discards its action and stops alternative requests', async t => {
  let release;
  const f = await automatic(t, () => new Promise(resolve => { release = resolve; }));
  const pending = f.ai.plan(planInput);
  while (!release) await new Promise(resolve => setTimeout(resolve, 5));
  await f.ai.configure({ automatic: false }); release(planned());
  assert.equal(await pending, null); assert.equal(f.calls.length, 1); assert.equal(f.ai.state().automatic, false);
});


test('automatic fix explanations are bounded navigation text and action-only responses stay compatible', async t => {
  const explanation = 'Open the composer with Start a post to continue the prepared workflow.';
  const f = await automatic(t, () => planned({ type: 'click', controlId: 'c1' }, { explanation }));
  assert.deepEqual(await f.ai.plan(planInput), { action: { type: 'click', controlId: 'c1' }, fix: explanation, model: models[0] });
  const schema = JSON.parse(f.calls[0][1].body).generationConfig.responseSchema;
  assert.equal(schema.properties.explanation.maxLength, 200);
  assert(schema.required.includes('explanation'), 'New requests ask for a visible explanation');
  const legacy = await automatic(t, () => planned({ type: 'wait' }));
  assert.equal((await legacy.ai.plan(planInput)).fix, 'Wait briefly for the current screen to finish loading.');
});

test('automatic fix text never returns secrets, code, URLs, publication or unrelated draft instructions', async t => {
  for (const explanation of [
    '', 'x'.repeat(201), 42, '<b>Open Edit</b>', 'Tap 400, 500', 'Open https://unsafe.example',
    'Send the prepared message.', 'Publish the update.', 'Tap Ｓａｖｅ.', 'Run adb shell.',
    'Use API key abc123', 'Try ' + KEY, 'Discard that other draft.', 'Select the recipient.'
  ]) {
    const f = await automatic(t, () => planned({ type: 'click', controlId: 'c1' }, { explanation }));
    assert.equal(await f.ai.plan(planInput), null, String(explanation));
    assert.equal(f.calls.length, 1);
    assert(!JSON.stringify(f.ai.state()).includes(KEY));
  }
});

const discardInput = { platform: 'whatsapp', stage: 'discard_owned_draft', capabilities: { discardOwnedDraft: true }, controls: [
  { id: 'c1', label: 'Discard', role: 'button', enabled: true, scrollable: false },
  { id: 'c2', label: 'Cancel', role: 'button', enabled: true, scrollable: false }
] };
test('only trusted WhatsApp owned-draft scope allows exact Discard and Cancel controls', async t => {
  const fix = 'Discard this verified unsent draft to unblock the composer.';
  const f = await automatic(t, () => planned({ type: 'click', controlId: 'c1' }, { explanation: fix }));
  assert.deepEqual(await f.ai.plan(discardInput), { action: { type: 'click', controlId: 'c1' }, fix, model: models[0] });
  const payload = JSON.parse(f.calls[0][1].body);
  assert.deepEqual(JSON.parse(payload.contents[0].parts[0].text), discardInput);
  assert(payload.systemInstruction.parts[0].text.includes('verified that the unsent draft belongs to this run'));
  for (const changed of [
    { ...discardInput, capabilities: undefined }, { ...discardInput, capabilities: { discardOwnedDraft: false } },
    { ...discardInput, capabilities: { discardOwnedDraft: true, extra: true } },
    { ...discardInput, platform: 'telegram' }, { ...discardInput, stage: 'open_composer' },
    { ...discardInput, controls: [{ ...discardInput.controls[0], label: 'Discard all data' }] },
    { ...discardInput, controls: [{ ...discardInput.controls[0], role: 'link' }] },
    { ...discardInput, controls: [{ ...discardInput.controls[0], scrollable: true }] }
  ]) {
    const blocked = await automatic(t);
    assert.equal(await blocked.ai.plan(changed), null, JSON.stringify(changed));
    assert.equal(blocked.calls.length, 0);
  }
  const ordinary = await automatic(t);
  assert.equal(await ordinary.ai.plan({ ...planInput, controls: discardInput.controls }), null);
  assert.equal(ordinary.calls.length, 0, 'Discard and Cancel are unavailable outside the owned-draft scope');
});

test('owned-draft scope cannot expose publishing or invented controls to Gemini', async t => {
  const f = await automatic(t, () => planned({ type: 'click', controlId: 'c2' }));
  const controls = [...discardInput.controls,
    { id: 'c3', label: 'Send', role: 'button', enabled: true, scrollable: false },
    { id: 'c4', label: 'Continue', role: 'button', enabled: true, scrollable: false },
    { id: 'c5', label: 'Draft area', role: 'scroll_region', enabled: true, scrollable: true }
  ];
  const result = await f.ai.plan({ ...discardInput, controls });
  assert.equal(result.action.controlId, 'c2'); assert.match(result.fix, /without discarding/);
  const payload = JSON.parse(f.calls[0][1].body);
  assert.deepEqual(JSON.parse(payload.contents[0].parts[0].text).controls, discardInput.controls);
  const invented = await automatic(t, () => planned({ type: 'click', controlId: 'c3' }));
  assert.equal(await invented.ai.plan({ ...discardInput, controls }), null);
});

test('progress is durable before fetch and cached fixes never pretend to call Gemini', async t => {
  const events = [];
  const f = await automatic(t, async () => {
    assert.equal(events.at(-1).phase, 'calling');
    assert.equal(events.at(-1).model, models[0]);
    return planned({ type: 'click', controlId: 'c1' }, { explanation: 'Open the composer to continue.' });
  });
  const onEvent = async event => { await Promise.resolve(); events.push(event); };
  const result = await f.ai.plan({ ...planInput, onEvent });
  assert(result); assert.deepEqual(events.map(event => event.phase), ['calling', 'proposed']);
  assert.equal(events[1].source, 'provider'); assert.equal(events[1].fix, result.fix);
  assert.deepEqual(events[1].action, result.action);
  assert(!f.calls[0][1].body.includes('onEvent'));
  assert(!JSON.stringify(await fs.readFile(path.join(f.dataDir, 'navigation-ai.json'), 'utf8')).includes('onEvent'));
  events.length = 0;
  assert.deepEqual(await f.ai.plan({ ...planInput, onEvent }), result);
  assert.deepEqual(events.map(event => event.phase), ['proposed']); assert.equal(events[0].source, 'cache');
  assert.equal(f.calls.length, 1);
});

test('busy model switching and exhausted quota have readable progress without raw provider failures', async t => {
  let calls = 0;
  const f = await automatic(t, () => ++calls === 1 ? failure(503, { error: { message: KEY } }) : planned());
  const events = [];
  assert(await f.ai.plan({ ...planInput, onEvent: event => events.push(event) }));
  assert.deepEqual(events.map(event => event.phase), ['calling', 'waiting', 'calling', 'proposed']);
  assert.deepEqual(events.filter(event => event.phase === 'calling').map(event => event.model), models.slice(0, 2));
  assert(!JSON.stringify(events).includes(KEY));
  const quota = await automatic(t, () => failure(429, { error: { message: KEY } }));
  const quotaEvents = [];
  assert.equal(await quota.ai.plan({ ...planInput, onEvent: event => quotaEvents.push(event) }), null);
  assert.deepEqual(quotaEvents.map(event => event.phase), ['calling', 'paused']);
  assert.match(quotaEvents[1].message, /quota|paused/i); assert(!JSON.stringify(quotaEvents).includes(KEY));
  quotaEvents.length = 0;
  assert.equal(await quota.ai.plan({ ...planInput, stage: 'next_navigation', onEvent: event => quotaEvents.push(event) }), null);
  assert.deepEqual(quotaEvents.map(event => event.phase), ['paused']); assert.equal(quota.calls.length, 1);
});

test('failed progress persistence stops provider calls or proposed actions instead of hiding the failure', async t => {
  const beforeCall = await automatic(t);
  assert.equal(await beforeCall.ai.plan({ ...planInput, onEvent: async () => { throw new Error('EPERM secret disk error'); } }), null);
  assert.equal(beforeCall.calls.length, 0); assert.match(beforeCall.ai.state().message, /progress could not be saved/i);
  const afterCall = await automatic(t);
  assert.equal(await afterCall.ai.plan({ ...planInput, onEvent: async event => { if (event.phase === 'proposed') throw new Error('EPERM'); } }), null);
  assert.equal(afterCall.calls.length, 1); assert.equal(afterCall.ai.cache.size, 0, 'A fix is not cached when its visible trace failed');
  assert.match(afterCall.ai.state().message, /stopped/i);
});

test('controlled recovery practice requests identify a harmless local preview and allow its exact Continue ID', async t => {
  const f = await automatic(t, () => planned({ type: 'click', controlId: 'c1' }, { explanation: 'Open the practice preview with Continue.' }));
  const result = await f.ai.plan({ platform: 'whatsapp', stage: 'recovery_probe', controls: [{ id: 'c1', label: 'Continue', role: 'button', enabled: true, scrollable: false }] });
  assert.equal(result.action.controlId, 'c1');
  const payload = JSON.parse(f.calls[0][1].body);
  assert(payload.systemInstruction.parts[0].text.includes('isolated local practice screen'));
  assert(payload.systemInstruction.parts[0].text.includes('nothing can be published here'));
});


test('disabling recovery from a pending progress write prevents fetch and discards cached/provider actions', async t => {
  const beforeFetch = await automatic(t);
  assert.equal(await beforeFetch.ai.plan({ ...planInput, onEvent: async event => { if (event.phase === 'calling') await beforeFetch.ai.configure({ automatic: false }); } }), null);
  assert.equal(beforeFetch.calls.length, 0);
  const beforeAction = await automatic(t);
  assert.equal(await beforeAction.ai.plan({ ...planInput, onEvent: async event => { if (event.phase === 'proposed') await beforeAction.ai.configure({ automatic: false }); } }), null);
  assert.equal(beforeAction.calls.length, 1); assert.equal(beforeAction.ai.cache.size, 0);
  const cached = await automatic(t); assert(await cached.ai.plan(planInput));
  assert.equal(await cached.ai.plan({ ...planInput, onEvent: async event => { if (event.source === 'cache') await cached.ai.configure({ automatic: false }); } }), null);
  assert.equal(cached.calls.length, 1);
});

test('a failed paused progress write never rejects into the job or returns an action', async t => {
  const f = await automatic(t, () => failure(429));
  assert.equal(await f.ai.plan({ ...planInput, onEvent: event => { if (event.phase === 'paused') throw new Error('EPERM'); } }), null);
  assert.match(f.ai.state().message, /progress could not be saved/i);
  assert.equal(f.calls.length, 1);
});

const reconnectInput = { platform: 'instagram_android', stage: 'reconnect_selected_phone', controls: [
  { id: 'c1', label: 'Reconnect selected phone', role: 'button', enabled: true, scrollable: false }
], capabilities: { reconnectSelectedPhone: true } };

test('selected-phone reconnect capability sends only a typed local action and no device or draft data', async t => {
  const fix = 'Reconnect the same paired phone and verify its identity before continuing.';
  const events = [];
  const f = await automatic(t, () => planned({ type: 'click', controlId: 'c1' }, { explanation: fix }));
  const result = await f.ai.plan({ ...reconnectInput, serial: 'PRIVATE_SERIAL', ip: 'PRIVATE_IP', screenshot: 'PRIVATE_SCREENSHOT', caption: 'PRIVATE_CAPTION', error: 'PRIVATE_RAW_ERROR', onEvent: event => events.push(event) });
  assert.deepEqual(result, { action: { type: 'click', controlId: 'c1' }, fix, model: models[0] });
  const payload = JSON.parse(f.calls[0][1].body);
  assert.deepEqual(JSON.parse(payload.contents[0].parts[0].text), reconnectInput);
  assert(!f.calls[0][1].body.includes('PRIVATE_'));
  assert.match(payload.systemInstruction.parts[0].text, /no readable mobile UI/);
  assert.match(payload.systemInstruction.parts[0].text, /verify the same paired phone identity/);
  assert.match(payload.systemInstruction.parts[0].text, /Preserve every already-completed action/);
  assert.deepEqual(events.map(event => event.phase), ['calling', 'proposed']);
  assert.equal(events[1].source, 'provider');
  events.length = 0;
  assert.deepEqual(await f.ai.plan({ ...reconnectInput, onEvent: event => events.push(event) }), result);
  assert.deepEqual(events.map(event => event.phase), ['proposed']);
  assert.equal(events[0].source, 'cache');
  assert.equal(f.calls.length, 1);
});

test('selected-phone reconnect scope rejects changed capabilities, stages, devices and arbitrary controls before spending quota', async t => {
  const control = reconnectInput.controls[0];
  const invalid = [
    { ...reconnectInput, platform: 'instagram_web' }, { ...reconnectInput, platform: 'whatsapp' },
    { ...reconnectInput, stage: 'open_composer' }, { ...reconnectInput, capabilities: undefined },
    { ...reconnectInput, capabilities: { reconnectSelectedPhone: false } },
    { ...reconnectInput, capabilities: { reconnectSelectedPhone: true, extra: true } },
    { ...reconnectInput, capabilities: { reconnectSelectedPhone: true, discardOwnedDraft: true } },
    { ...reconnectInput, controls: [] }, { ...reconnectInput, controls: [control, { ...control, id: 'c2' }] },
    ...[
      { id: 'c2' }, { label: 'Reconnect any phone' }, { label: 'reconnect selected phone' },
      { label: 'Reconnect selected phone ' }, { role: 'link' }, { enabled: false }, { scrollable: true },
      { serial: 'PRIVATE_SERIAL' }, { ip: '192.168.1.4' }, { selector: '#anything' }, { command: 'reconnect' }
    ].map(change => ({ ...reconnectInput, controls: [{ ...control, ...change }] }))
  ];
  const f = await automatic(t);
  for (const input of invalid) assert.equal(await f.ai.plan(input), null, JSON.stringify(input));
  assert.equal(await f.ai.plan({ ...planInput, controls: reconnectInput.controls }), null, 'The application-only control is reserved outside its capability');
  assert.equal(f.calls.length, 0);
  assert.equal(f.ai.state().today.used, 0);
});

test('selected-phone reconnect never accepts model commands, selectors, invented controls or device addresses', async t => {
  for (const [action, extra] of [
    [{ type: 'shell', command: 'adb connect' }],
    [{ type: 'click', controlId: 'c2' }],
    [{ type: 'click', controlId: 'c1', selector: 'Reconnect' }],
    [{ type: 'click', controlId: 'c1', serial: 'another-phone' }],
    [{ type: 'scroll', controlId: 'c1', direction: 'down' }],
    [{ type: 'click', controlId: 'c1' }, { explanation: 'Run adb shell to reconnect.' }],
    [{ type: 'click', controlId: 'c1' }, { explanation: 'Reconnect to 192.168.1.4.' }],
    [{ type: 'click', controlId: 'c1' }, { explanation: 'Use phone aa:bb:cc:dd:ee:ff.' }],
    [{ type: 'click', controlId: 'c1' }, { explanation: 'Publish the Story after reconnecting.' }],
    [{ type: 'click', controlId: 'c1' }, { command: 'reconnect' }]
  ]) {
    const f = await automatic(t, () => planned(action, extra));
    assert.equal(await f.ai.plan(reconnectInput), null, JSON.stringify({ action, extra }));
    assert.equal(f.calls.length, 1);
  }
  const compatible = await automatic(t);
  assert.equal((await compatible.ai.plan(reconnectInput)).fix, 'Reconnect the same paired phone and verify its identity before continuing.');
  for (const action of [{ type: 'stop' }, { type: 'wait' }]) {
    const f = await automatic(t, () => planned(action));
    assert.deepEqual((await f.ai.plan(reconnectInput)).action, action, 'The provider may safely decline or wait');
  }
});

test('phone reconnect uses the shared durable rate limit and reports busy/quota without claiming an action', async t => {
  const events = [];
  let count = 0;
  const f = await automatic(t, () => ++count === 1 ? failure(503) : planned());
  assert.equal((await f.ai.plan({ ...reconnectInput, onEvent: event => events.push(event) })).model, models[1]);
  assert.deepEqual(events.map(event => event.phase), ['calling', 'waiting', 'calling', 'proposed']);
  assert.equal(f.ai.state().today.used, 2);
  assert.equal(await f.ai.plan(planInput), null);
  assert.equal(f.calls.length, 2, 'Reconnect does not bypass limits for subsequent navigation');
  const quotaEvents = [];
  const quota = await automatic(t, () => failure(429, { error: { message: KEY } }));
  assert.equal(await quota.ai.plan({ ...reconnectInput, onEvent: event => quotaEvents.push(event) }), null);
  assert.deepEqual(quotaEvents.map(event => event.phase), ['calling', 'paused']);
  assert(!JSON.stringify(quotaEvents).includes(KEY));
  assert.equal(quota.calls.length, 1);
  assert.equal(quota.ai.state().today.used, 1);
});

test('a stopped or unrecorded phone reconnect request never returns a repair action', async t => {
  const stopped = new AbortController(); stopped.abort();
  const f = await automatic(t);
  assert.equal(await f.ai.plan({ ...reconnectInput, signal: stopped.signal }), null);
  assert.equal(f.calls.length, 0);
  assert.equal(await f.ai.plan({ ...reconnectInput, onEvent: async event => { if (event.phase === 'calling') throw new Error('trace unavailable'); } }), null);
  assert.equal(f.calls.length, 0, 'The API is not called if visible progress cannot be recorded');
  const afterCall = await automatic(t);
  assert.equal(await afterCall.ai.plan({ ...reconnectInput, onEvent: async event => { if (event.phase === 'proposed') throw new Error('trace unavailable'); } }), null);
  assert.equal(afterCall.calls.length, 1);
  assert.equal(afterCall.ai.cache.size, 0);
});
