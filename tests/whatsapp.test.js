// Copyright (c) 2026 Mrinal. Offline tests; no WhatsApp update is sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaults, validateConfig } from '../server/config.js';
import { PLATFORMS, parseCaptions, validateDraft } from '../shared/platforms.js';
import { whatsappChannelUrl, DEFAULT_WHATSAPP_URL } from '../shared/whatsapp.js';
import { Queue } from '../server/queue.js';
import { BrowserManager } from '../server/automation/browser.js';

test('WhatsApp accepts only a unique public channel URL and exact channel name', () => {
  assert.equal(whatsappChannelUrl(DEFAULT_WHATSAPP_URL + '?source=copy_link'), DEFAULT_WHATSAPP_URL);
  for (const url of ['https://web.whatsapp.com/', 'https://chat.whatsapp.com/invite', 'https://wa.me/919999999999', 'https://whatsapp.com.evil.test/channel/0029Vb5iXnYJUM2bxaL3Rd1K', 'https://me:secret@whatsapp.com/channel/0029Vb5iXnYJUM2bxaL3Rd1K']) assert.equal(whatsappChannelUrl(url), null);
  const config = structuredClone(defaults); config.platforms.whatsapp.channelUrl = 'https://wa.me/919999999999';
  assert.throws(() => validateConfig(config), /channel link/);
  const legacy = structuredClone(defaults); delete legacy.platforms.whatsapp;
  assert.equal(validateConfig(legacy).platforms.whatsapp.channelUrl, DEFAULT_WHATSAPP_URL);
});
test('WhatsApp import is optional for old files but mandatory when selected for posting', () => {
  const legacy = PLATFORMS.filter(p => p.id !== 'whatsapp').map(p => `=====${p.delimiter}=====\nCaption`).join('\n\n');
  const parsed = parseCaptions(legacy); assert.deepEqual(parsed.errors, []); assert.equal(parsed.captions.whatsapp, '');
  assert(validateDraft({ selected: ['whatsapp'], captions: parsed.captions }, []).some(error => /add a caption/.test(error)));
  const imported = parseCaptions(legacy + '\n\n=====WHATSAPP=====\nनमस्ते ✅\n\nChannel update');
  assert.equal(imported.captions.whatsapp, 'नमस्ते ✅\n\nChannel update');
  assert.deepEqual(validateDraft({ selected: ['whatsapp'], captions: imported.captions }, []), []);
  assert.deepEqual(validateDraft({ selected: ['whatsapp'], captions: imported.captions }, [{}]), []);
  assert(validateDraft({ selected: ['whatsapp'], captions: imported.captions }, [{}, {}]).some(error => /1 image/.test(error)));
});
const until = async predicate => { const end = Date.now() + 5000; while (!predicate()) { if (Date.now() > end) throw new Error('Queue timeout'); await new Promise(resolve => setTimeout(resolve, 10)); } };
test('an expired WhatsApp session pauses all destinations before any LIVE adapter runs', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mrinal-wa-preflight-')), calls = [];
  const browser = { page: async () => ({ isClosed: () => true }) }; let linked = false;
  const queue = new Queue(browser, { dataDir, runner: async ctx => { calls.push(ctx.id); return 'posted'; }, loginChecker: async ctx => { assert.equal(ctx.requireEmpty, true); return linked ? { status: 'verified' } : { status: 'needs_login', message: 'Link the worker again' }; } });
  await queue.init(); const run = await queue.start({ mode: 'LIVE', confirmation: 'POST', config: defaults, media: [], draft: { selected: ['instagram', 'whatsapp'], captions: { instagram: 'Post', whatsapp: 'Channel' } } });
  await until(() => run.status === 'attention' && !queue.processing); assert.deepEqual(calls, []);
  assert.equal(run.items[1].status, 'attention'); assert.equal(queue.login.items.whatsapp.status, 'needs_login');
  linked = true; await queue.control('continue'); await until(() => run.status === 'completed' && !queue.processing);
  assert.deepEqual(calls, ['instagram', 'whatsapp']);
});
test('a browser/preflight exception also pauses safely instead of stranding a running queue', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mrinal-wa-failure-'));
  const queue = new Queue({ page: async () => { throw new Error('Worker unavailable'); } }, { dataDir, runner: async () => { throw new Error('Must not run'); } });
  await queue.init(); const run = await queue.start({ config: defaults, media: [], draft: { selected: ['whatsapp'], captions: { whatsapp: 'Hello' } } });
  await until(() => run.status === 'attention' && !queue.processing); assert.match(run.items[0].message, /Worker unavailable/);
  await queue.snapshot(run, run.items[0], {}, 'error', true); // No screenshot or full DOM on WhatsApp errors.
  assert.deepEqual((await fs.readdir(path.join(dataDir, 'logs', run.id))).filter(name => /\.(html|png)$/.test(name)), []);
});
test('the worker reuses a single WhatsApp tab and refuses an ambiguous two-tab session', async () => {
  let focused = 0; const tab = { url: () => 'https://web.whatsapp.com/', isClosed: () => false, bringToFront: async () => { focused++; } };
  const manager = new BrowserManager(); manager.context = { pages: () => [tab] };
  assert.equal(await manager.page('whatsapp'), tab); assert.equal(focused, 1);
  const ambiguous = new BrowserManager(); ambiguous.context = { pages: () => [tab, { ...tab }] };
  await assert.rejects(ambiguous.page('whatsapp'), /More than one/);
});
