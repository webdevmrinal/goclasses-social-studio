// Copyright (c) 2026 Mrinal. Offline tests only; no social publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import sharp from 'sharp';
import twitterText from 'twitter-text';
import { defaults } from '../server/config.js';
import { createApp } from '../server/index.js';
import { validateDraft, PLATFORMS } from '../shared/platforms.js';
import { mediaFor } from '../shared/media.js';
import { destinationReadiness } from '../shared/readiness.js';

const config = structuredClone(defaults); config.platforms.x.handle = 'GOClasses_CSE'; config.platforms.instagram.handle = 'goclasses_cse';
const media = Array.from({ length: 5 }, (_, i) => ({ id: String(i), filename: `${i}.png` }));
const draft = () => ({ selected: ['instagram', 'x', 'whatsapp'], mediaIds: media.map(m => m.id), captions: Object.fromEntries(PLATFORMS.map(p => [p.id, 'Caption ✅'])), mediaByPlatform: { x: ['3', '1', '4', '0'], whatsapp: ['2'] } });
test('five shared images become independent ordered selections without truncation', () => {
  const current = draft(); assert.deepEqual(validateDraft(current, media), []);
  assert.deepEqual(mediaFor(current, media, 'x').map(m => m.id), ['3', '1', '4', '0']);
  assert.deepEqual(mediaFor(current, media, 'whatsapp').map(m => m.id), ['2']);
  assert.deepEqual(mediaFor(current, media, 'instagram'), media);
  delete current.mediaByPlatform; assert.equal(validateDraft(current, media).filter(e => /or fewer/.test(e)).length, 2);
  current.mediaByPlatform = { whatsapp: [], x: ['0'] }; assert.deepEqual(validateDraft(current, media), []);
  current.mediaByPlatform.x = []; assert(validateDraft(current, media).some(e => /X: add at least one/.test(e)));
});
test('invalid, duplicate and out-of-library image assignments cannot reach an adapter', () => {
  for (const ids of [['0', '0'], ['missing'], 'not-an-array']) {
    const current = draft(); current.mediaByPlatform.x = ids;
    assert(validateDraft(current, media).some(e => /unique images/.test(e)));
  }
});
test('readiness isolates fatal errors, exact X weighting and the last unresolved matching attempt', () => {
  const current = draft(), xLength = text => twitterText.parseTweet(text).weightedLength;
  current.captions.x = 'https://example.com/' + 'a'.repeat(350);
  assert.equal(destinationReadiness(current, media, config, {}, xLength).x.ready, true);
  let ready = destinationReadiness(current, media, config, { whatsapp: { status: 'needs_login', message: 'Relink device' } }, xLength);
  assert.equal(ready.whatsapp.ready, false); assert.equal(ready.x.ready, true); assert.equal(ready.instagram.ready, true);
  const runs = [{ captions: current.captions, media, mediaByPlatform: current.mediaByPlatform, items: [{ id: 'x', status: 'failed', message: 'Composer unavailable' }] }];
  ready = destinationReadiness(current, media, config, {}, xLength, runs); assert.equal(ready.x.ready, false); assert.equal(ready.instagram.ready, true);
  const edited = structuredClone(current); edited.captions.x = 'Edited caption'; assert.equal(destinationReadiness(edited, media, config, {}, xLength, runs).x.ready, true);
  runs.unshift({ ...runs[0], items: [{ id: 'x', status: 'dry_run' }] }); assert.equal(destinationReadiness(current, media, config, {}, xLength, runs).x.ready, true);
});
const until = async fn => { const end = Date.now() + 5000; while (!fn()) { if (Date.now() > end) throw Error('Worker timeout'); await new Promise(r => setTimeout(r, 10)); } };
test('HTTP queue and single/bulk retries preserve each exact image set and reject unsafe retry targets', async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mrinal-destinations-')), calls = [];
  let fail = true;
  const { app, queue } = await createApp({ dataDir, browser: { page: async () => ({ isClosed: () => true }) }, queueOptions: {
    loginChecker: async () => ({ status: 'verified' }),
    runner: async ctx => { assert.equal(ctx.mode, 'TEST'); assert.equal(ctx.confirmedLive, false); calls.push({ id: ctx.id, files: ctx.files.map(f => path.basename(f)) }); if (fail && ctx.id !== 'whatsapp') throw Error('Fixture preparation failed'); return 'dry_run'; }
  } });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (url, body, method = 'POST') => fetch(origin + url, { method, headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await request('/api/config', config, 'PUT');
  const buffer = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#168b63' } }).png().toBuffer();
  const form = new FormData(); for (let i = 0; i < 5; i++) form.append('images', new Blob([buffer], { type: 'image/png' }), `image-${i}.png`);
  const uploaded = (await (await fetch(origin + '/api/upload', { method: 'POST', headers: { Origin: origin }, body: form })).json()).media;
  const current = draft(); current.mediaIds = uploaded.map(m => m.id); current.mediaByPlatform = { x: [3, 1, 4, 0].map(i => uploaded[i].id), whatsapp: [uploaded[2].id] };
  let response = await request('/api/runs', { draft: current }); assert.equal(response.status, 201);
  await until(() => queue.runs[0].status === 'completed_with_errors' && !queue.processing);
  const original = queue.runs[0]; assert.deepEqual(calls.map(c => c.files.length), [5, 4, 1]);
  assert.deepEqual(calls[1].files, [3, 1, 4, 0].map(i => uploaded[i].filename));
  // Mutating the caller's draft cannot change a saved retry's images.
  current.mediaByPlatform.x.reverse(); fail = false; calls.length = 0;
  response = await request(`/api/runs/${original.id}/retry`, { platform: 'x' }); assert.equal(response.status, 201);
  await until(() => queue.runs[0].status === 'completed' && !queue.processing);
  assert.deepEqual(calls.map(c => c.id), ['x']); assert.deepEqual(calls[0].files, [3, 1, 4, 0].map(i => uploaded[i].filename));
  assert.equal(original.items.find(i => i.id === 'instagram').status, 'failed');
  assert.equal((await request(`/api/runs/${original.id}/retry`, { platform: 'whatsapp' })).status, 400);
  assert.equal((await request(`/api/runs/${original.id}/retry`, { platform: 'unknown' })).status, 400);
  calls.length = 0; assert.equal((await request(`/api/runs/${original.id}/retry`, {})).status, 201);
  await until(() => queue.runs[0].status === 'completed' && !queue.processing); assert.deepEqual(calls.map(c => c.id), ['instagram', 'x']);
  original.items.find(i => i.id === 'x').status = 'uncertain'; assert.equal((await request(`/api/runs/${original.id}/retry`, { platform: 'x' })).status, 400);
  queue.login.items.x = { status: 'needs_login', message: 'Sign in again' };
  const changed = { ...current, selected: ['x'], captions: { ...current.captions, x: 'New caption' } };
  const readiness = await (await request('/api/readiness', changed)).json(); assert.equal(readiness.destinations.x.ready, false);
  assert.equal((await request('/api/runs', { draft: changed })).status, 400);
});
