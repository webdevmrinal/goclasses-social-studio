// Copyright (c) 2026 Mrinal. Isolated outcome-resolution fixture; no social sites or native sessions.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { createApp } from '../server/index.js';
import { defaults } from '../server/config.js';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mrinal-instagram-resolution-ui-'));
const config = structuredClone(defaults); config.platforms.instagram.handle = 'goclasses_cse';
await fs.writeFile(path.join(dataDir, 'config.json'), JSON.stringify(config));
const runnerCalls = [], controlCalls = [], startCalls = [], workerErrors = [];
let browserCalls = 0, nativeCalls = 0;
const { app, queue } = await createApp({
  dataDir,
  securityOptions: { password: '', origin: '', secureCookie: false },
  browser: { page: async () => { browserCalls++; throw Error('Outcome resolution must never open a social browser.'); } },
  queueOptions: {
    instagramWorker: { busy: false, checkAccount: async () => { nativeCalls++; throw Error('Outcome resolution must never start native work.'); }, close: async () => {} },
    runner: async ctx => { runnerCalls.push(ctx.id); throw Error('Outcome resolution must never publish or prepare a destination.'); }
  }
});
queue.on('workerError', error => workerErrors.push(error.message));
const control = queue.control.bind(queue), start = queue.start.bind(queue);
queue.control = async (...args) => { controlCalls.push(args); return control(...args); };
queue.start = async (...args) => { startCalls.push(args); return start(...args); };
const createdAt = new Date().toISOString();
const pendingRun = {
  id: 'instagram-proof-with-pending-story', createdAt, mode: 'LIVE', confirmedLive: true, status: 'attention',
  config: structuredClone(config), captions: { instagram: 'Reviewed feed caption', x: 'Waiting for the Story' }, media: [],
  instagram: { postingMethod: 'android', music: { enabled: false }, story: { enabled: true, linkEnabled: false, sourcePostUrl: '' } },
  mediaByPlatform: { instagram: [], instagramStory: [], x: [] },
  items: [
    { id: 'instagram', status: 'uncertain', submitting: true, message: 'The exact new Instagram post could not be confirmed.', screenshots: [] },
    { id: 'instagramStory', status: 'attention', submitting: false, message: 'Verify the feed post before continuing this Story.', screenshots: [] },
    { id: 'x', status: 'queued', submitting: false, message: 'Waiting in queue', screenshots: [] }
  ]
};
const notPublishedRun = {
  id: 'instagram-confirm-not-published', createdAt, mode: 'LIVE', confirmedLive: false, status: 'completed_with_errors',
  config: structuredClone(config), captions: { instagram: 'Separate uncertain feed caption' }, media: [],
  instagram: { postingMethod: 'web' }, mediaByPlatform: { instagram: [] },
  items: [{ id: 'instagram', status: 'uncertain', submitting: true, message: 'Check whether this separate post was published.', screenshots: [] }]
};
const missingLinkRun = {
  id: 'instagram-already-posted-without-source-link', createdAt, mode: 'LIVE', confirmedLive: false, status: 'attention',
  config: structuredClone(config), captions: { instagram: 'Previously published feed awaiting its Story' }, media: [],
  instagram: { postingMethod: 'android', music: { enabled: false }, story: { enabled: true, linkEnabled: false, sourcePostUrl: '' } },
  mediaByPlatform: { instagram: [], instagramStory: [] },
  items: [
    { id: 'instagram', status: 'posted', submitting: true, message: 'Operator verified outcome: posted.', screenshots: [] },
    { id: 'instagramStory', status: 'attention', submitting: false, message: 'The existing feed needs its exact source post link.', screenshots: [] }
  ]
};
queue.runs = [pendingRun, missingLinkRun, notPublishedRun]; await queue.change();
const originalPendingRun = structuredClone(pendingRun), waitingItems = structuredClone(pendingRun.items.slice(1));
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const errors = [], externalRequests = [], mutations = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  const url = new URL(request.url());
  if (url.origin === origin && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push({ path: url.pathname, body: request.postDataJSON() });
});
await page.route('**/*', route => {
  if (new URL(route.request().url()).origin !== origin) { externalRequests.push(route.request().url()); return route.abort(); }
  return route.continue();
});
const card = id => page.locator(`[data-run-id="${id}"]`);
const openCard = async id => { const run = card(id); if (!await run.evaluate(el => el.open)) await run.locator('.run-summary').click(); return run; };
const assertNoWork = () => {
  assert.deepEqual(controlCalls, [], 'Saving an outcome never continues the active LIVE run');
  assert.deepEqual(startCalls, [], 'Saving an outcome never starts or retries a run');
  assert.deepEqual(runnerCalls, [], 'The feed is not rerun and the Story never starts automatically');
  assert.equal(browserCalls, 0); assert.equal(nativeCalls, 0); assert.equal(queue.processing, false);
  assert.deepEqual(workerErrors, []); assert.equal(queue.runs.length, 3);
};
try {
  await page.goto(origin); await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await openCard(pendingRun.id);
  await card(pendingRun.id).getByRole('button', { name: 'Verified published', exact: true }).click();
  await page.getByRole('heading', { name: 'Confirm the published Instagram post', exact: true }).waitFor();
  assert.equal(await page.locator('#resolution-post-url').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('#confirm-resolution').innerText(), 'Save published post');
  await page.locator('#confirm-resolution').click();
  assert.match(await page.locator('#resolution-error').innerText(), /Paste the published Instagram post link/);
  assert.deepEqual(mutations, [], 'An empty link is rejected before sending a resolution');
  assert.deepEqual(pendingRun, originalPendingRun); assertNoWork();

  const invalidUrl = 'https://www.instagram.com/reel/NOT_A_FEED_POST/';
  await page.locator('#resolution-post-url').fill(invalidUrl);
  const rejected = page.waitForResponse(response => response.url().endsWith(`/api/runs/${pendingRun.id}/resolve`) && response.request().method() === 'POST');
  await page.locator('#confirm-resolution').click(); assert.equal((await rejected).status(), 400);
  await page.locator('#resolution-error').filter({ hasText: /native publication permalink/ }).waitFor();
  assert.equal(await page.locator('#modal').evaluate(el => el.open), true);
  assert.equal(await page.locator('#confirm-resolution').isEnabled(), true);
  assert.deepEqual(pendingRun, originalPendingRun, 'An invalid link cannot alter the uncertain feed or waiting Story');
  assert.deepEqual(mutations, [{ path: `/api/runs/${pendingRun.id}/resolve`, body: { platform: 'instagram', resolution: 'posted', publication: { postUrl: invalidUrl } } }]);
  assertNoWork();

  const submittedUrl = 'https://instagram.com/p/PROOF_123-ABC/?igsh=tracking#record';
  const canonicalUrl = 'https://www.instagram.com/p/PROOF_123-ABC/';
  await page.locator('#resolution-post-url').fill(`  ${submittedUrl}  `);
  await fs.mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/instagram-resolution-dialog.png' });
  const saved = page.waitForResponse(response => response.url().endsWith(`/api/runs/${pendingRun.id}/resolve`) && response.request().method() === 'POST');
  await page.locator('#confirm-resolution').click(); assert.equal((await saved).ok(), true);
  await page.locator('#modal').waitFor({ state: 'hidden' });
  assert.deepEqual(mutations[1], { path: `/api/runs/${pendingRun.id}/resolve`, body: { platform: 'instagram', resolution: 'posted', publication: { postUrl: submittedUrl } } });
  assert.equal(pendingRun.items[0].status, 'posted'); assert.equal(pendingRun.items[0].publication.postUrl, canonicalUrl);
  assert.equal(pendingRun.items[0].publication.verifiedBy, 'operator_confirmation');
  assert(Number.isFinite(Date.parse(pendingRun.items[0].publication.verifiedAt)));
  assert.match(pendingRun.items[0].message, /operator confirmed this exact post link/);
  assert.equal(pendingRun.status, 'attention'); assert.deepEqual(pendingRun.items.slice(1), waitingItems);
  assert.equal(await card(pendingRun.id).getByRole('link', { name: 'View post', exact: true }).getAttribute('href'), canonicalUrl);
  assert.equal(await card(pendingRun.id).locator('[data-control="continue"]').isVisible(), true, 'Continuing remains a separate operator action');
  assertNoWork();
  await queue.persistChain;
  const stored = JSON.parse(await fs.readFile(path.join(dataDir, 'runs.json'), 'utf8')).find(run => run.id === pendingRun.id);
  assert.equal(stored.status, 'attention'); assert.equal(stored.items[0].status, 'posted');
  assert.deepEqual(stored.items[0].publication, pendingRun.items[0].publication); assert.deepEqual(stored.items.slice(1), waitingItems);

  await page.reload(); await page.getByRole('button', { name: 'Activity', exact: true }).click(); await openCard(pendingRun.id);
  assert.equal(await card(pendingRun.id).getByRole('link', { name: 'View post', exact: true }).getAttribute('href'), canonicalUrl);
  assert.equal(await card(pendingRun.id).getByRole('button', { name: 'Verified published', exact: true }).count(), 0);
  assert.equal(await card(pendingRun.id).locator('.run-item').nth(0).getByText('Published', { exact: true }).isVisible(), true);
  assert.equal(await card(pendingRun.id).locator('.run-item').nth(1).getByText('Needs attention', { exact: true }).isVisible(), true);
  assertNoWork();
  await page.screenshot({ path: 'test-results/instagram-resolution-saved.png', fullPage: true });

  await openCard(notPublishedRun.id);
  await card(notPublishedRun.id).getByRole('button', { name: 'Verified not published', exact: true }).click();
  await page.getByRole('heading', { name: 'Verify the outcome on the platform', exact: true }).waitFor();
  assert.equal(await page.locator('#resolution-post-url').count(), 0, 'Not-published confirmation does not request a post link');
  assert.match(await page.locator('#confirm-resolution').innerText(), /I checked.*confirm/);
  const failed = page.waitForResponse(response => response.url().endsWith(`/api/runs/${notPublishedRun.id}/resolve`) && response.request().method() === 'POST');
  await page.locator('#confirm-resolution').click(); assert.equal((await failed).ok(), true); await page.locator('#modal').waitFor({ state: 'hidden' });
  assert.deepEqual(mutations[2], { path: `/api/runs/${notPublishedRun.id}/resolve`, body: { platform: 'instagram', resolution: 'failed' } });
  assert.equal(notPublishedRun.items[0].status, 'failed'); assert.equal(notPublishedRun.items[0].publication, undefined);
  assert.match(notPublishedRun.items[0].message, /not published; may retry/);
  assert.equal(pendingRun.status, 'attention'); assert.deepEqual(pendingRun.items.slice(1), waitingItems);
  assert.equal(mutations.length, 3, 'Only explicit outcome-resolution requests are sent'); assertNoWork();

  await openCard(missingLinkRun.id);
  const waitingStory = structuredClone(missingLinkRun.items[1]);
  assert.equal(await card(missingLinkRun.id).getByRole('link', { name: 'View post', exact: true }).count(), 0);
  await card(missingLinkRun.id).getByRole('button', { name: 'Add post link', exact: true }).click();
  await page.getByRole('heading', { name: 'Confirm the published Instagram post', exact: true }).waitFor();
  assert.equal(await page.locator('#confirm-resolution').innerText(), 'Save published post');
  const recoveredUrl = 'https://www.instagram.com/p/LEGACY_POST_123/';
  await page.locator('#resolution-post-url').fill(recoveredUrl);
  const recovered = page.waitForResponse(response => response.url().endsWith(`/api/runs/${missingLinkRun.id}/resolve`) && response.request().method() === 'POST');
  await page.locator('#confirm-resolution').click(); assert.equal((await recovered).ok(), true); await page.locator('#modal').waitFor({ state: 'hidden' });
  assert.deepEqual(mutations[3], { path: `/api/runs/${missingLinkRun.id}/resolve`, body: { platform: 'instagram', resolution: 'posted', publication: { postUrl: recoveredUrl } } });
  assert.equal(missingLinkRun.items[0].status, 'posted'); assert.equal(missingLinkRun.items[0].publication.postUrl, recoveredUrl);
  assert.equal(missingLinkRun.items[0].publication.verifiedBy, 'operator_confirmation');
  assert.equal(missingLinkRun.status, 'attention'); assert.deepEqual(missingLinkRun.items[1], waitingStory);
  assert.equal(await card(missingLinkRun.id).getByRole('button', { name: 'Add post link', exact: true }).count(), 0);
  assert.equal(await card(missingLinkRun.id).getByRole('link', { name: 'View post', exact: true }).getAttribute('href'), recoveredUrl);
  await queue.persistChain;
  const recoveredStored = JSON.parse(await fs.readFile(path.join(dataDir, 'runs.json'), 'utf8')).find(run => run.id === missingLinkRun.id);
  assert.deepEqual(recoveredStored.items[0].publication, missingLinkRun.items[0].publication); assert.deepEqual(recoveredStored.items[1], waitingStory);
  assert.equal(mutations.length, 4, 'Adding a missing source link sends only an explicit resolution request');
  assertNoWork(); assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  console.log('Instagram resolution UI passed: required link, invalid permalink feedback, exact trimmed request, saved canonical operator proof, waiting Story preserved across reload, unchanged not-published confirmation, already-posted source-link recovery, and no feed rerun or automatic LIVE continuation. Offline fixture only.');
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await queue.persistChain;
  assert.equal(path.dirname(dataDir), path.resolve(os.tmpdir())); assert(path.basename(dataDir).startsWith('mrinal-instagram-resolution-ui-'));
  await fs.rm(dataDir, { recursive: true, force: true });
}