// Copyright (c) 2026 Mrinal. No social website is opened by these tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_REPLY_MESSAGES, detectManychatLinks, instagramPostUrl, manychatBuilderUrl, replyBatch, selectPostCard, validateManychatDraft } from '../shared/manychat.js';
import { validateDraft } from '../shared/platforms.js';
import { defaults } from '../server/config.js';
import { Queue } from '../server/queue.js';

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
