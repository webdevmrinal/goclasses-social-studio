// Copyright (c) 2026 Mrinal. Tests never open or publish to a social platform.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import sharp from 'sharp';
import twitterText from 'twitter-text';
import { PLATFORMS, parseCaptions, validateDraft } from '../shared/platforms.js';
import { defaults, validateConfig, atomicWrite, readJson } from '../server/config.js';
import { finishPost, InterventionError, NetworkError } from '../server/automation/utils.js';
import { Queue } from '../server/queue.js';
import { createApp } from '../server/index.js';

const temp = () => fs.mkdtemp(path.join(os.tmpdir(), 'mrinal-studio-test-'));
const until = async predicate => {
  const end = Date.now() + 5000;
  while (!predicate()) { if (Date.now() > end) throw new Error('Timed out waiting for queue.'); await new Promise(resolve => setTimeout(resolve, 10)); }
};
const fakeBrowser = { page: async () => ({ isClosed: () => true, close: async () => {} }) };
const draft = ids => ({ selected: ids, captions: Object.fromEntries(ids.map(id => [id, 'Hello ✅ हिन्दी'])), mediaIds: [] });
const setup = async options => { const dataDir = await temp(); const queue = new Queue(fakeBrowser, { dataDir, ...options }); await queue.init(); return { queue, dataDir }; };
const runParams = (ids = ['x', 'instagram']) => ({ draft: draft(ids), config: defaults, media: [] });

test('structured captions preserve Unicode and intentional line breaks', () => {
  const input = PLATFORMS.map(p => `=====${p.delimiter}=====\n  नमस्ते ✅\n\nSecond line  `).join('\n\n');
  const result = parseCaptions(input);
  assert.deepEqual(result.errors, []);
  assert.equal(result.captions.youtubeCS, 'नमस्ते ✅\n\nSecond line');
});
test('parser accepts omitted captions but rejects duplicate and unknown sections', () => {
  const result = parseCaptions('=====X=====\n\n=====X=====\nSecond\n=====UNKNOWN=====\nHi');
  assert(result.errors.some(s => s.includes('Duplicate')));
  assert(result.errors.some(s => s.includes('Unknown')));
  assert(!result.errors.some(s=>s.includes('missing or empty')));
  assert.deepEqual(parseCaptions('=====X=====\nOnly X').errors,[]);
  assert.equal(parseCaptions('=====X=====\nOnly X').captions.instagram,'');
});
test('X uses weighted Unicode and URL counting on the server', () => {
  const weighted = text => twitterText.parseTweet(text).weightedLength;
  assert(validateDraft({ selected: ['x'], captions: { x: '界'.repeat(141) } }, [{}], weighted).some(s => s.includes('280')));
  assert.deepEqual(validateDraft({ selected: ['x'], captions: { x: `Read https://example.com/${'a'.repeat(400)}` } }, [{}], weighted), []);
  assert(validateDraft({ selected: ['x'], captions: { x: 'Hi' } }, [{}, {}, {}, {}, {}], weighted).some(s => s.includes('4 images')));
});
test('configuration accepts supplied admin dashboard and rejects unsafe destinations', () => {
  assert.equal(validateConfig(defaults).platforms.linkedin.companyPageUrl, defaults.platforms.linkedin.companyPageUrl);
  const unsafe = structuredClone(defaults); unsafe.platforms.manychat.flowUrl = 'https://manychat.com.evil.example/';
  assert.throws(() => validateConfig(unsafe), /manychat.com/);
  unsafe.platforms.manychat.flowUrl = defaults.platforms.manychat.flowUrl;
  unsafe.platforms.linkedin.companyPageUrl = 'https://www.linkedin.com/in/someone/';
  assert.throws(() => validateConfig(unsafe), /admin/);
});
test('TEST and unrecognized modes never invoke publication', async () => {
  let publications = 0;
  for (const mode of [undefined, 'TEST', 'test', 'anything']) {
    const result = await finishPost({ mode, confirmedLive: true, publish: async () => publications++, verify: async () => {}, snapshot: async () => {}, step: async () => {}, markSubmitting: async () => {} });
    assert.equal(result, 'dry_run');
  }
  assert.equal(publications, 0);
});
test('LIVE requires confirmation and persists intent before exactly one publication', async () => {
  const actions = [];
  const base = { mode: 'LIVE', publish: async () => actions.push('publish'), verify: async () => actions.push('verify'), snapshot: async () => {}, step: async () => {}, markSubmitting: async () => actions.push('persist') };
  await assert.rejects(finishPost(base), /confirmation/);
  assert.deepEqual(actions, []);
  assert.equal(await finishPost({ ...base, confirmedLive: true }), 'posted');
  assert.deepEqual(actions, ['persist', 'publish', 'verify']);
});
test('queue serializes destinations and pause takes effect at the boundary', async () => {
  let release; const entered = [];
  const { queue } = await setup({ runner: async ctx => { entered.push(ctx.id); if (entered.length === 1) await new Promise(r => { release = r; }); return 'dry_run'; } });
  const run = await queue.start(runParams());
  await until(() => release);
  await queue.control('pause'); release();
  await until(() => run.status === 'paused');
  assert.deepEqual(entered, ['x']);
  assert.equal(run.items[1].status, 'queued');
  await queue.control('resume');
  await until(() => run.status === 'completed');
  assert.deepEqual(entered, ['x', 'instagram']);
});
test('stop lets the in-flight preparation finish and skips remaining destinations', async () => {
  let release;
  const { queue } = await setup({ runner: async () => { await new Promise(r => { release = r; }); return 'dry_run'; } });
  const run = await queue.start(runParams());
  await until(() => release); await queue.control('stop'); release();
  await until(() => run.status === 'stopped');
  assert.equal(run.items[0].status, 'dry_run'); assert.equal(run.items[1].status, 'skipped');
});
test('auth and network errors pause the queue for operator intervention', async () => {
  for (const ErrorType of [InterventionError, NetworkError]) {
    let attempts = 0;
    const { queue } = await setup({ runner: async () => { if (++attempts === 1) throw new ErrorType('Needs help'); return 'dry_run'; } });
    const run = await queue.start(runParams(['x']));
    await until(() => run.status === 'attention');
    assert.equal(run.items[0].status, 'attention');
    await queue.control('continue'); await until(() => run.status === 'completed');
    assert.equal(attempts, 2);
  }
});
test('a lost publication confirmation is uncertain and never automatically retried', async () => {
  let clicks = 0;
  const { queue } = await setup({ runner: async ctx => { await ctx.markSubmitting(); clicks++; throw new Error('Confirmation lost'); } });
  const run = await queue.start({ ...runParams(['x']), mode: 'LIVE', confirmation: 'POST' });
  await until(() => run.status === 'completed_with_errors');
  assert.equal(run.items[0].status, 'uncertain'); assert.equal(clicks, 1);
  assert.equal(run.items.filter(i => i.status === 'failed').length, 0);
  await queue.resolve(run.id, 'x', 'failed'); assert.equal(run.items[0].status, 'failed');
});
test('worker restart never silently resumes LIVE work', async () => {
  const dataDir = await temp();
  await atomicWrite(path.join(dataDir, 'runs.json'), [{ id: 'interrupted', mode: 'LIVE', confirmedLive: true, status: 'running', items: [{ id: 'x', status: 'running', submitting: true }, { id: 'instagram', status: 'queued' }] }]);
  const queue = new Queue(fakeBrowser, { dataDir }); await queue.init();
  assert.equal(queue.runs[0].status, 'interrupted'); assert.equal(queue.runs[0].confirmedLive, false);
  assert.equal(queue.runs[0].items[0].status, 'uncertain'); assert.equal(queue.runs[0].items[1].status, 'skipped');
});
test('queue rejects concurrent runs and unconfirmed LIVE starts', async () => {
  const { queue } = await setup({ runner: async () => { throw new InterventionError('Sign in'); } });
  await assert.rejects(queue.start({ ...runParams(), mode: 'LIVE' }), /POST/);
  await assert.rejects(queue.start({ ...runParams(), mode: 'OTHER' }), /Invalid/);
  await queue.start(runParams());
  await assert.rejects(queue.start(runParams()), /already active/);
  await until(() => !queue.processing); await queue.control('stop');
});
test('legacy manual ManyChat results never await or record a LIVE save during TEST', async () => {
  const { queue } = await setup({ runner: async () => ({ manual: true }) });
  queue.snapshot = async () => {};
  queue.browser = { page: async () => ({ goto: async () => {}, isClosed: () => false }) };
  const run = await queue.start(runParams(['manychat']));
  await until(() => run.status === 'completed');
  assert.equal(run.items[0].status, 'dry_run'); assert.equal(run.items[0].submitting, false);
});
test('ManyChat activation respects a requested pause at its completion boundary', async () => {
  let release;
  const { queue } = await setup({ runner: async () => { await new Promise(r => { release = r; }); return { status: 'posted' }; } });
  queue.snapshot = async () => {};
  const params = runParams(['manychat']);
  params.draft.manychat = { postUrl: 'https://www.instagram.com/p/EXAMPLE/' };
  const run = await queue.start({ ...params, mode: 'LIVE', confirmation: 'POST' });
  await until(() => release); await queue.control('pause'); release();
  await until(() => run.status === 'paused');
  assert.equal(run.items[0].status, 'posted'); assert.equal(queue.replyRotation.offset, 3);
  await queue.control('resume'); await until(() => run.status === 'completed');
});

test('legacy ManyChat adapters reporting incomplete setup cannot pass a TEST', async () => {
  const { queue } = await setup({ runner: async () => ({ manual: true, libraryOnly: true }) });
  queue.snapshot = async () => {};
  queue.browser = { page: async () => ({ goto: async () => {}, isClosed: () => false }) };
  const run = await queue.start(runParams(['manychat']));
  await until(() => run.status === 'completed_with_errors');
  assert.equal(run.items[0].status, 'needs_setup');
  assert.equal(run.items[0].submitting, false);
  assert.match(run.items[0].message, /exact automation URL/);
});
test('a stuck preparation is closed and cannot hold the queue indefinitely', async () => {
  let closed = false;
  const { queue } = await setup({ deadline: 30, runner: async () => new Promise(() => {}) });
  queue.browser = { page: async () => ({ close: async () => { closed = true; }, isClosed: () => closed }) };
  const run = await queue.start(runParams(['x']));
  await until(() => run.status === 'completed_with_errors');
  assert(closed); assert.equal(run.items[0].status, 'failed');
});
test('HTTP integration: password, origin, image validation, preview and retry protections', async t => {
  const dataDir = await temp();
  let manualUrl;
  const httpBrowser = { ...fakeBrowser, manualLogin: async url => { manualUrl = url; httpBrowser.manualProcess = {}; return 'Google Chrome'; } };
  const { app, queue } = await createApp({ dataDir, browser: httpBrowser, securityOptions: { password: 'test-workspace-password' }, queueOptions: { runner: async () => 'dry_run' } });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, options = {}) => fetch(base + url, options);
  const json = (body, cookie) => ({ method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  assert.equal((await request('/api/bootstrap')).status, 401);
  assert.equal((await request('/api/login', { ...json({ password: 'test-workspace-password' }), headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' } })).status, 403);
  assert.equal((await request('/api/login', json({ password: 'wrong' }))).status, 401);
  const login = await request('/api/login', json({ password: 'test-workspace-password' }));
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const bootstrap = await request('/api/bootstrap', { headers: { Cookie: cookie } });
  assert.equal(bootstrap.status, 200);
  const image = await sharp({ create: { width: 180, height: 180, channels: 3, background: '#1672ef' } }).png().toBuffer();
  const form = new FormData(); form.append('images', new Blob([image], { type: 'image/png' }), 'test.png');
  const upload = await request('/api/upload', { method: 'POST', headers: { Origin: base, Cookie: cookie }, body: form });
  assert.equal(upload.status, 201);
  const uploaded = (await upload.json()).media[0]; assert.equal(uploaded.width, 180); assert(uploaded.filename.endsWith('.png'));
  assert.deepEqual(Buffer.from(await (await request(uploaded.url, { headers: { Cookie: cookie } })).arrayBuffer()), image, 'The uploaded original is kept byte for byte');
  const cleanResponse = await request(`/api/media/${uploaded.id}/clean`, json({}, cookie)); assert.equal(cleanResponse.status, 201);
  const cleaned = (await cleanResponse.json()).media; assert(cleaned.verification.pixelsEqual); assert.equal(cleaned.sourceId, uploaded.id);
  const metadataResponse = await request(`/api/media/${cleaned.id}/metadata`, { headers: { Cookie: cookie } }); assert.equal(metadataResponse.status, 200);
  assert.equal((await metadataResponse.json()).media.metadata.credentials, false);
  assert.equal((await request(uploaded.url)).status, 401);
  assert.equal((await request(uploaded.url, { headers: { Cookie: cookie } })).status, 200);
  const bad = new FormData(); bad.append('images', new Blob(['not an image'], { type: 'image/png' }), 'fake.png');
  assert.equal((await request('/api/upload', { method: 'POST', headers: { Origin: base, Cookie: cookie }, body: bad })).status, 400);
  const tooLarge = new FormData(); tooLarge.append('images', new Blob([new Uint8Array(20 * 1024 * 1024 + 1)], { type: 'image/png' }), 'too-large.png');
  assert.equal((await request('/api/upload', { method: 'POST', headers: { Origin: base, Cookie: cookie }, body: tooLarge })).status, 413);
  const validDraft = { ...draft(['x']), mediaIds: [uploaded.id] };
  const preview = await request('/api/validate', json(validDraft, cookie)); assert.equal(preview.status, 200);
  assert.equal((await request('/api/runs', json({ draft: validDraft, mode: 'LIVE' }, cookie))).status, 400);
  // Configure expected identity, then validate only TEST runs on an injected offline adapter.
  const config = structuredClone(defaults); config.platforms.x.handle = 'goclasses';
  assert.equal((await request('/api/config', { ...json(config, cookie), method: 'PUT' })).status, 200);
  assert.equal((await request('/api/runs', json({ draft: validDraft, mode: 'LIVE' }, cookie))).status, 400);
  const started = await request('/api/runs', json({ draft: validDraft }, cookie)); assert.equal(started.status, 201);
  await until(() => queue.runs[0].status === 'completed' && !queue.processing); assert.equal(queue.runs[0].mode, 'TEST');
  assert.equal((await request(`/api/runs/${queue.runs[0].id}/retry`, json({}, cookie))).status, 400);
  // Create one failure and one success; the retry endpoint must exclude the success.
  queue.runner = async ctx => { if (ctx.id === 'x') throw new Error('Preparation failed'); return 'dry_run'; };
  const twoDraft = { ...draft(['x', 'instagram']), mediaIds: [uploaded.id] };
  config.platforms.instagram.handle = 'goclasses';
  assert.equal((await request('/api/config', { ...json(config, cookie), method: 'PUT' })).status, 200);
  assert.equal((await request('/api/runs', json({ draft: twoDraft }, cookie))).status, 201);
  await until(() => queue.runs[0].status === 'completed_with_errors' && !queue.processing);
  const originalId = queue.runs[0].id; queue.runner = async () => 'dry_run';
  assert.equal((await request(`/api/runs/${originalId}/retry`, json({}, cookie))).status, 201);
  await until(() => queue.runs[0].status === 'completed' && !queue.processing);
  assert.deepEqual(queue.runs[0].items.map(i => i.id), ['x']);
  assert.equal((await request('/api/manual-login', json({ platform: 'manychat' }, cookie))).status, 200);
  assert.equal(manualUrl, 'https://app.manychat.com/fb5759472/cms');
  assert.equal(queue.state().workerBusy, true);
  assert.equal((await request('/api/runs', json({ draft: validDraft }, cookie))).status, 400);
  httpBrowser.manualProcess = null;
  assert.equal(queue.state().workerBusy, false);
  assert.equal((await request('/api/logout', json({}, cookie))).status, 200);
  assert.equal((await request('/api/bootstrap', { headers: { Cookie: cookie } })).status, 401);
  assert.equal((await readJson(path.join(dataDir, 'media.json'), [] )).length, 2);
});
