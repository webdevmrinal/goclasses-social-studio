// Copyright (c) 2026 Mrinal. Local unit fixtures; no social publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { publicationUrl } from '../server/automation/publication.js';
import { finishPost } from '../server/automation/utils.js';
import { Queue } from '../server/queue.js';
import { defaults } from '../server/config.js';

test('publication permalinks accept only native HTTPS post records', () => {
  assert.equal(publicationUrl('linkedin', 'https://www.linkedin.com/feed/update/urn:li:share:123?actorCompanyId=74757117'), 'https://www.linkedin.com/feed/update/urn:li:share:123');
  assert.equal(publicationUrl('youtubeDA', 'https://www.youtube.com/post/UgkxExample_123?share=1'), 'https://www.youtube.com/post/UgkxExample_123');
  for (const link of ['javascript:alert(1)', 'https://www.youtube.com.evil.example/post/Ugkx123', 'https://www.youtube.com/watch?v=123', 'https://user@www.youtube.com/post/Ugkx123']) assert.equal(publicationUrl('youtubeCS', link), null);
});
test('a failed diagnostic after confirmation cannot downgrade or repeat a publication', async () => {
  const actions = [];
  const status = await finishPost({ mode: 'LIVE', confirmedLive: true, preflight: async () => {}, publish: async () => actions.push('publish'), verify: async () => actions.push('verified'), markSubmitting: async () => actions.push('persist'), step: async () => {}, snapshot: async label => { if (label === 'published') throw Error('Composer closed before screenshot'); } });
  assert.equal(status, 'posted'); assert.deepEqual(actions, ['persist', 'publish', 'verified']);
});
test('resolving all uncertain posts recomputes the completed run summary without rerunning adapters', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mrinal-resolve-')); let calls = 0;
  const queue = new Queue({ page: async () => ({ isClosed: () => true }) }, { dataDir, runner: async ctx => { calls++; await ctx.markSubmitting(); throw Error('Receipt unavailable'); } });
  await queue.init(); const run = await queue.start({ draft: { selected: ['x', 'linkedin'], captions: { x: 'Caption', linkedin: 'Caption' } }, config: defaults, media: [], mode: 'LIVE', confirmation: 'POST' });
  const end = Date.now() + 3000; while (queue.processing) { if (Date.now() > end) throw Error('Queue timeout'); await new Promise(r => setTimeout(r, 10)); }
  assert.equal(run.status, 'completed_with_errors'); assert.equal(calls, 2);
  await queue.resolve(run.id, 'x', 'posted'); assert.equal(run.status, 'completed_with_errors');
  await assert.rejects(queue.resolve(run.id, 'linkedin', 'posted', { postUrl: 'javascript:alert(1)' }), /native publication permalink/);
  assert.equal(run.items[1].status, 'uncertain');
  await queue.resolve(run.id, 'linkedin', 'posted', { postUrl: 'https://www.linkedin.com/feed/update/urn:li:share:123' }); assert.equal(run.status, 'completed'); assert.equal(calls, 2); assert(run.items.every(item => item.status === 'posted'));
  assert.equal(run.items[1].publication.verifiedBy, 'read_only_recheck');
  await queue.resolve(run.id, 'linkedin', 'posted', { postUrl: 'https://www.linkedin.com/feed/update/urn:li:share:123' }); assert.equal(calls, 2);
});
test('startup repairs stale error summaries after earlier operator resolutions', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mrinal-summary-'));
  await fs.writeFile(path.join(dataDir, 'runs.json'), JSON.stringify([{ id: 'resolved', status: 'completed_with_errors', items: [{ id: 'linkedin', status: 'posted' }, { id: 'x', status: 'posted' }] }, { id: 'still-uncertain', status: 'completed_with_errors', items: [{ id: 'x', status: 'uncertain' }] }]));
  const queue = new Queue({}, { dataDir }); await queue.init();
  assert.equal(queue.runs[0].status, 'completed'); assert.equal(queue.runs[1].status, 'completed_with_errors');
});
