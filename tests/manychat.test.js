// Copyright (c) 2026 Mrinal. No social website is opened by these tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_REPLY_MESSAGES, detectManychatLinks, instagramPostUrl, manychatBuilderUrl, manychatPublicationSource, replyBatch, selectPostCard, validateManychatDraft } from '../shared/manychat.js';
import { validateDraft } from '../shared/platforms.js';
import { defaults } from '../server/config.js';
import { Queue } from '../server/queue.js';
import { once } from 'node:events';
import { createApp } from '../server/index.js';

test('ManyChat normalizes actual Instagram profile-grid and picker URLs', () => {
  assert.equal(instagramPostUrl('/goclasses_cse/p/ABC_123-x/'), 'https://www.instagram.com/p/ABC_123-x/');
  assert.equal(instagramPostUrl('https://instagram.com/reel/ABC_123/?igsh=123'), 'https://www.instagram.com/reel/ABC_123/');
  for (const url of ['https://instagram.com.evil.test/p/ABC/', 'https://me:secret@instagram.com/p/ABC/', 'javascript:alert(1)', 'https://instagram.com/goclasses_cse/']) assert.equal(instagramPostUrl(url), null);
  assert.equal(manychatBuilderUrl('https://app.manychat.com/fb5759472/cms?path=/'), defaults.platforms.manychat.flowUrl);
});

test('reply pool has twenty editable choices and rotates three without duplicates', () => {
  assert.equal(DEFAULT_REPLY_MESSAGES.length, 20);
  assert.deepEqual(replyBatch(undefined, 0), DEFAULT_REPLY_MESSAGES.slice(0, 3));
  assert.deepEqual(replyBatch(undefined, 19), [DEFAULT_REPLY_MESSAGES[19], DEFAULT_REPLY_MESSAGES[0], DEFAULT_REPLY_MESSAGES[1]]);
  assert.throws(() => replyBatch('one\none\ntwo'), /different comment replies/);
});

test('LIVE post matching requires both a newly published permalink and exact caption', () => {
  const old = { url: 'https://www.instagram.com/p/OLD/', caption: 'Same caption' };
  const newerUnrelated = { url: 'https://www.instagram.com/p/UNRELATED/', caption: 'Other caption' };
  const intended = { url: 'https://www.instagram.com/p/NEW/', caption: 'Same\ncaption' };
  const cards = [newerUnrelated, old, intended];
  const params = { mode: 'LIVE', caption: 'Same caption', publication: { candidates: [newerUnrelated.url, intended.url] } };
  assert.equal(selectPostCard(cards, params), intended);
  assert.equal(selectPostCard(cards, { ...params, publication: null }), null);
  assert.equal(selectPostCard(cards, { ...params, caption: 'Wrong caption' }), null);
  assert.equal(selectPostCard(cards, { mode: 'TEST' }), newerUnrelated);
  assert.equal(selectPostCard(cards, { mode: 'LIVE', postUrl: old.url }), old);
  assert.equal(selectPostCard([...cards, intended], params), null, 'Ambiguous matches must never activate');
});

test('ManyChat message and link validation blocks invalid or oversized content', () => {
  assert(validateDraft({ selected: ['manychat'], captions: { manychat: 'x'.repeat(1001) } }, []).some(error => error.includes('1,000')));
  assert.deepEqual(validateManychatDraft({ links: [{ label: '', url: '' }] }), { postUrl: '', links: [] });
  assert.throws(() => validateManychatDraft({ postUrl: 'https://example.com/p/abc/' }), /Instagram/);
  assert.throws(() => validateManychatDraft({ links: [{ label: 'Open', url: 'javascript:alert(1)' }] }), /HTTPS/);
  assert.throws(() => validateManychatDraft({ links: [{ label: '', url: 'https://example.com/' }] }), /button label/);
  assert.throws(() => validateManychatDraft({ links: Array(4).fill({ label: 'Open', url: 'https://example.com/' }) }), /three/);
});

test('DM links become short named buttons, deduplicated without losing URL parameters or parentheses', () => {
  const caption = 'Apply here: https://example.org/application?id=7&source=ig\n[Download the complete course brochure](https://example.org/brochure_(CS).pdf)\nTelegram:\nhttps://t.me/goclasses.\nAgain https://example.org/application?id=7&source=ig';
  const links = detectManychatLinks(caption);
  assert.deepEqual(links, [
    { label: 'Apply here', url: 'https://example.org/application?id=7&source=ig' },
    { label: 'View brochure', url: 'https://example.org/brochure_(CS).pdf' },
    { label: 'Telegram', url: 'https://t.me/goclasses' }
  ]);
  assert.deepEqual(validateManychatDraft({}, caption).links, links, 'API callers receive automatic buttons too');
  assert.deepEqual(detectManychatLinks('www.goclasses.in\nWatch our explanation of this topic at https://youtube.com/watch?v=abc'), [
    { label: 'Open goclasses.in', url: 'https://www.goclasses.in/' },
    { label: 'Watch on YouTube', url: 'https://youtube.com/watch?v=abc' }
  ]);
  assert(detectManychatLinks('https://extremely-long-domain-name.example/')[0].label.length <= 20);
  const manual = { linksMode: 'manual', links: [{ label: 'My custom title', url: links[0].url }] };
  assert.deepEqual(validateManychatDraft(manual, 'https://another.example/').links, manual.links, 'Reviewed custom buttons survive DM edits');
  assert.deepEqual(validateManychatDraft({ ...manual, linksMode: 'auto' }, 'https://another.example/').links, [{ label: 'Open another.example', url: 'https://another.example/' }]);
  assert.throws(() => validateManychatDraft({}, 'https://a.test https://b.test https://c.test https://d.test'), /three link buttons/);
  assert.throws(() => validateManychatDraft({}, 'http://example.org'), /HTTPS/);
});

const until = async predicate => { const end = Date.now() + 5000; while (!predicate()) { if (Date.now() > end) throw new Error('Queue timeout'); await new Promise(resolve => setTimeout(resolve, 10)); } };
test('ManyChat follows Instagram, receives its publication, and advances replies only after LIVE success', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mrinal-manychat-'));
  const contexts = [];
  const publication = { candidates: ['https://www.instagram.com/p/NEW/'] };
  const browser = { page: async () => ({ isClosed: () => true, close: async () => {} }) };
  const queue = new Queue(browser, { dataDir, runner: async ctx => { contexts.push(ctx); return ctx.id === 'instagram' ? { status: 'posted', publication } : { status: ctx.mode === 'LIVE' ? 'posted' : 'dry_run' }; } });
  await queue.init();
  const params = { draft: { selected: ['manychat', 'instagram'], captions: { instagram: 'Caption', manychat: 'Course details: https://www.goclasses.in/' } }, config: defaults, media: [], mode: 'LIVE', confirmation: 'POST' };
  const run = await queue.start(params); await until(() => run.status === 'completed' && !queue.processing);
  assert.deepEqual(contexts.map(ctx => ctx.id), ['instagram', 'manychat']);
  assert.deepEqual(contexts[1].instagramPublication, publication);
  assert.deepEqual(contexts[1].manychat.links, [{ label: 'Course details', url: 'https://www.goclasses.in/' }]);
  assert.deepEqual(run.manychat.replies, DEFAULT_REPLY_MESSAGES.slice(0, 3));
  assert.equal(queue.replyRotation.offset, 3);
  const rehearsal = await queue.start({ ...params, mode: 'TEST' }); await until(() => rehearsal.status === 'completed' && !queue.processing);
  assert.deepEqual(rehearsal.manychat.replies, DEFAULT_REPLY_MESSAGES.slice(3, 6));
  assert.equal(queue.replyRotation.offset, 3);
  const restored = new Queue(browser, { dataDir }); await restored.init(); assert.equal(restored.replyRotation.offset, 3);
  await assert.rejects(queue.start({ ...params, draft: { ...params.draft, selected: ['manychat'] } }), /exact Instagram post URL/);
});


test('a confirmed exact Instagram publication selects only its unique card without candidate or alt-caption requirements', () => {
  const exact = 'https://www.instagram.com/p/EXACT_POST/';
  const intended = { url: exact + '?igsh=picker', caption: 'Generated or shortened image description' };
  const unrelated = { url: 'https://www.instagram.com/p/NEWEST/', caption: 'Reviewed caption' };
  const params = { mode: 'LIVE', caption: 'Reviewed caption', publication: { postUrl: exact, verifiedBy: 'operator_confirmation' } };
  assert.equal(selectPostCard([unrelated, intended], params), intended);
  const profileCard = { ...intended, url: 'https://www.instagram.com/goclasses_cse/p/EXACT_POST/' };
  assert.equal(selectPostCard([unrelated, profileCard], params), profileCard, 'Observed profile-prefixed picker links still match strict exact proof');
  assert.equal(selectPostCard([profileCard, intended], params), null, 'Profile and direct picker duplicates are ambiguous');
  assert.equal(selectPostCard([unrelated, intended], { ...params, publication: { ...params.publication, candidates: [unrelated.url] } }), intended, 'Authoritative exact proof overrides candidate hints');
  assert.equal(selectPostCard([unrelated], params), null, 'A missing exact card cannot fall back to the latest card');
  assert.equal(selectPostCard([unrelated], { ...params, publication: { postUrl: exact, candidates: [unrelated.url] } }), null, 'A missing exact card cannot downgrade to candidate matching');
  assert.equal(selectPostCard([intended, { ...intended, url: exact }], params), null, 'Canonical duplicate exact cards are ambiguous');
  assert.equal(selectPostCard([intended, { ...intended, url: exact }], { mode: 'LIVE', postUrl: exact }), null, 'An explicit Compose URL also requires a unique card');
  assert.deepEqual(manychatPublicationSource({ postUrl: 'https://instagram.com/p/EXACT_POST/?igsh=receipt#proof' }), { postUrl: exact, candidates: [] });
});

test('ManyChat publication proof rejects malformed shapes and forged URLs without downgrading to candidates', async t => {
  const exact = 'https://www.instagram.com/p/EXACT_POST/';
  const invalidUrls = ['/p/EXACT_POST/', '//www.instagram.com/p/EXACT_POST/', 'http://www.instagram.com/p/EXACT_POST/', 'https://www.instagram.com:444/p/EXACT_POST/', 'https://user@www.instagram.com/p/EXACT_POST/', 'https://www.instagram.com.evil.test/p/EXACT_POST/', 'https://example.com/p/EXACT_POST/', 'https://www.instagram.com/ours/p/EXACT_POST/', 'https://www.instagram.com/p/EXACT_POST/extra', 'javascript:alert(1)', 'not a URL', 'https:///www.instagram.com/p/EXACT_POST/', 'https://www.instagram.com/p/WRONG/../EXACT_POST/', 'https://www.instagram.com/p/WRONG/%2e%2e/EXACT_POST/', 'https:\\www.instagram.com\\p\\EXACT_POST\\', 'https://www.instagram.com/p/EXACT_POST/\n', ' https://www.instagram.com/p/EXACT_POST/', 42, null];
  for (const postUrl of invalidUrls) await t.test(String(postUrl), () => {
    const publication = { postUrl, candidates: [exact] };
    assert.equal(manychatPublicationSource(publication), null);
    assert.equal(selectPostCard([{ url: exact, caption: 'Reviewed caption' }], { mode: 'LIVE', publication, caption: 'Reviewed caption' }), null);
  });
  const decoratedArray = Object.assign([], { postUrl: exact });
  for (const publication of [undefined, null, exact, [], [exact], decoratedArray, {}, { candidates: exact }, { candidates: { 0: exact, length: 1 } }, { candidates: [] }, { candidates: Array(1) }, { candidates: [exact, 'https://example.com/p/WRONG/'] }, { postUrl: exact, candidates: exact }]) {
    assert.equal(manychatPublicationSource(publication), null);
    assert.equal(selectPostCard([{ url: exact, caption: 'Reviewed caption' }], { mode: 'LIVE', publication, caption: 'Reviewed caption' }), null);
  }
  assert.equal(selectPostCard([{ url: exact }], { mode: 'LIVE', postUrl: '/p/EXACT_POST/' }), null, 'Explicit source URLs must also be absolute native permalinks');
  assert.deepEqual(manychatPublicationSource({ candidates: [exact] }), { postUrl: null, candidates: [exact] });
});

test('candidate-only ManyChat proof still requires the exact caption and rejects duplicate or unrelated cards', () => {
  const candidate = { url: 'https://www.instagram.com/p/CANDIDATE/', caption: 'Reviewed\ncaption' };
  const unrelated = { url: 'https://www.instagram.com/p/LATEST/', caption: 'Reviewed caption' };
  const params = { mode: 'LIVE', caption: 'Reviewed caption', publication: { candidates: [candidate.url] } };
  assert.equal(selectPostCard([unrelated, candidate], params), candidate);
  assert.equal(selectPostCard([unrelated, { ...candidate, caption: 'Different caption' }], params), null);
  assert.equal(selectPostCard([unrelated], params), null);
  assert.equal(selectPostCard([candidate, { ...candidate }], params), null);
  assert.equal(selectPostCard([{ ...candidate, caption: '' }], { ...params, caption: '' }), null, 'Empty candidate captions are not matching publication evidence');
  assert.equal(selectPostCard([{ ...candidate, caption: undefined }], { ...params, caption: undefined }), null);
});

test('ManyChat-only LIVE queue accepts confirmed exact proof and rejects non-proof candidate lengths before execution', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mrinal-manychat-proof-')), calls = [];
  const proof = { postUrl: 'https://www.instagram.com/p/VERIFIED_SOURCE/', verifiedBy: 'operator_confirmation' };
  const queue = new Queue({ page: async () => ({ isClosed: () => true, close: async () => {} }) }, { dataDir, runner: async ctx => { calls.push(ctx); return 'posted'; } });
  try {
    await queue.init();
    const params = { draft: { selected: ['manychat'], captions: { instagram: 'Reviewed feed', manychat: 'Reviewed DM' } }, config: defaults, media: [], mode: 'LIVE', confirmation: 'POST' };
    for (const sourceInstagramPublication of [[proof.postUrl], Object.assign([], proof), { candidates: proof.postUrl }, { candidates: { length: 1 } }, { postUrl: 'https://evil.example/p/WRONG/' }]) await assert.rejects(queue.start({ ...params, sourceInstagramPublication }), /exact Instagram post URL/);
    assert.equal(queue.runs.length, 0); assert.deepEqual(calls, []);
    const run = await queue.start({ ...params, sourceInstagramPublication: proof }); await until(() => run.status === 'completed' && !queue.processing);
    assert.deepEqual(calls.map(ctx => ctx.id), ['manychat']); assert.deepEqual(calls[0].instagramPublication, proof);
    assert.deepEqual(run.sourceInstagramPublication, proof); assert.equal(run.items[0].status, 'posted');
  } finally { await queue.persistChain; assert.equal(path.dirname(dataDir), path.resolve(os.tmpdir())); assert(path.basename(dataDir).startsWith('mrinal-manychat-proof-')); await fs.rm(dataDir, { recursive: true, force: true }); }
});

test('a LIVE ManyChat-only HTTP retry inherits the same-run posted Instagram exact proof without rerunning the feed', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mrinal-manychat-retry-proof-')), calls = [];
  const config = structuredClone(defaults); config.platforms.instagram.handle = 'goclasses_cse';
  await fs.writeFile(path.join(dataDir, 'config.json'), JSON.stringify(config));
  const proof = { postUrl: 'https://www.instagram.com/p/RECOVERED_FEED/', verifiedBy: 'operator_confirmation', verifiedAt: new Date().toISOString() };
  const { app, queue } = await createApp({ dataDir, securityOptions: { password: '', origin: '', secureCookie: false }, browser: { page: async () => ({ isClosed: () => true, close: async () => {} }) }, queueOptions: { runner: async ctx => {
    calls.push(ctx.id); assert.equal(ctx.id, 'manychat'); assert.equal(ctx.mode, 'LIVE'); assert.equal(ctx.confirmedLive, true);
    assert.deepEqual(ctx.instagramPublication, proof);
    const card = { url: proof.postUrl, caption: 'Picker alt text is not the native caption' };
    assert.equal(selectPostCard([{ url: 'https://www.instagram.com/p/UNRELATED/', caption: ctx.instagramCaption }, card], { mode: ctx.mode, publication: ctx.instagramPublication, caption: ctx.instagramCaption }), card);
    return 'posted';
  } } });
  const original = { id: 'confirmed-feed-failed-manychat', createdAt: new Date().toISOString(), mode: 'LIVE', status: 'completed_with_errors', config, captions: { instagram: 'Reviewed native feed caption', manychat: 'Reviewed DM' }, media: [], mediaByPlatform: { instagram: [], manychat: [] }, instagram: { postingMethod: 'web' }, manychat: { postUrl: '', links: [], replies: replyBatch() }, items: [{ id: 'instagram', status: 'posted', publication: proof }, { id: 'manychat', status: 'failed', submitting: false }] };
  queue.runs = [original]; await queue.change();
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${origin}/api/runs/${original.id}/retry`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'LIVE', confirmation: 'POST', platform: 'manychat', metadataConsent: {} }) });
    assert.equal(response.status, 201, await response.text());
    await until(() => queue.runs[0].status === 'completed' && !queue.processing); await queue.persistChain;
    assert.deepEqual(calls, ['manychat']); assert.equal(queue.runs[0].retryOf, original.id); assert.deepEqual(queue.runs[0].items.map(item => item.id), ['manychat']);
    assert.deepEqual(queue.runs[0].sourceInstagramPublication, proof); assert.equal(original.items[0].status, 'posted'); assert.deepEqual(original.items[0].publication, proof);
    const stored = JSON.parse(await fs.readFile(path.join(dataDir, 'runs.json'), 'utf8'));
    assert.deepEqual(stored[0].sourceInstagramPublication, proof);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await queue.persistChain; assert.equal(path.dirname(dataDir), path.resolve(os.tmpdir())); assert(path.basename(dataDir).startsWith('mrinal-manychat-retry-proof-')); await fs.rm(dataDir, { recursive: true, force: true }); }
});