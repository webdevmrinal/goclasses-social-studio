// Copyright (c) 2026 Mrinal. Isolated dependency UI fixture; no social sites or native sessions.
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { createApp } from '../server/index.js';
import { defaults } from '../server/config.js';
import { freshDraft } from '../shared/draft.js';

const draftKey = 'mrinal.social-studio.draft';
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mrinal-dependencies-ui-'));
const config = structuredClone(defaults);
config.platforms.instagram.handle = 'fixture'; config.platforms.x.handle = 'fixture';
await fs.writeFile(path.join(dataDir, 'config.json'), JSON.stringify(config));
const runnerCalls = [], browserCalls = [], nativeCalls = [], workerErrors = [];
const phoneTools = new EventEmitter();
phoneTools.screen = { opening: false, close: async () => {} };
phoneTools.configure = async () => {};
phoneTools.state = () => ({ devices: [], connected: false, scanning: false, mirror: { open: false } });
phoneTools.close = async () => {};
const noNative = operation => { nativeCalls.push(operation); assert.fail('Dependency review must not start native work: ' + operation); };
const { app, queue } = await createApp({
  dataDir, phoneTools, securityOptions: { password: '', origin: '', secureCookie: false },
  browser: { page: async id => { browserCalls.push(id); assert.equal(id, 'manychat'); return { isClosed: () => true }; } },
  queueOptions: {
    instagramWorker: { busy: false, checkAccount: async () => noNative('checkAccount'), selection: () => noNative('selection'), close: async () => {} },
    loginChecker: async () => assert.fail('Fixture connections are already verified'),
    runner: async ctx => {
      assert.equal(ctx.id, 'manychat'); assert.equal(ctx.mode, 'TEST'); assert.equal(ctx.confirmedLive, false);
      runnerCalls.push({ id: ctx.id, postUrl: ctx.manychat.postUrl, files: ctx.files }); return 'dry_run';
    }
  }
});
queue.on('workerError', error => workerErrors.push(error.message));
queue.login.items.instagram = { status: 'verified', message: 'Offline fixture verified', transport: 'web' };
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const errors = [], externalRequests = [], nativeRequests = [], runRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.url() === origin + '/api/runs' && request.method() === 'POST') runRequests.push(request.postDataJSON()); });
await page.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin !== origin) { externalRequests.push(url.href); return route.abort(); }
  if (/^\/api\/(?:android(?:\/|$)|instagram\/music)/.test(url.pathname)) { nativeRequests.push(url.pathname); return route.abort(); }
  return route.continue();
});
const baseDraft = () => {
  const draft = freshDraft('web');
  Object.assign(draft.captions, { instagram: 'A retained feed caption', x: 'A retained additional caption', manychat: 'Here are the course details: https://example.test/course' });
  return draft;
};
const staleDraft = baseDraft(); staleDraft.selected = ['manychat']; staleDraft.instagram.story.enabled = true;
await page.addInitScript(({ draftKey, draft }) => {
  const next = sessionStorage.getItem('mrinal.dependencies-ui.next');
  if (next) { localStorage.setItem(draftKey, next); sessionStorage.removeItem('mrinal.dependencies-ui.next'); }
  if (!localStorage.getItem('mrinal.dependencies-ui.seeded')) {
    localStorage.setItem(draftKey, JSON.stringify(draft)); localStorage.setItem('mrinal.dependencies-ui.seeded', 'true');
  }
}, { draftKey, draft: staleDraft });
const savedDraft = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), draftKey);
const savedText = () => page.evaluate(key => localStorage.getItem(key), draftKey);
const assertSelected = async ids => {
  await page.waitForFunction(({ key, ids }) => JSON.stringify(JSON.parse(localStorage.getItem(key)).selected.slice().sort()) === JSON.stringify(ids.slice().sort()), { key: draftKey, ids });
  assert.deepEqual((await savedDraft()).selected.slice().sort(), ids.slice().sort());
};
const compose = () => page.getByRole('button', { name: 'Compose', exact: true }).click();
const loadDraft = async draft => {
  await page.evaluate(value => sessionStorage.setItem('mrinal.dependencies-ui.next', JSON.stringify(value)), draft);
  await page.reload(); await compose();
};
const preview = async () => {
  await page.getByRole('button', { name: 'Preview posts', exact: true }).click();
  await page.getByRole('heading', { name: 'Review posts', exact: true }).waitFor();
};
const assertPreview = async ids => {
  await page.waitForFunction(ids => JSON.stringify([...document.querySelectorAll('[data-preview-destination]')].map(card => card.dataset.previewDestination).sort()) === JSON.stringify(ids.slice().sort()), ids);
  assert.deepEqual((await page.locator('[data-preview-destination]').evaluateAll(cards => cards.map(card => card.dataset.previewDestination))).sort(), ids.slice().sort());
};
const dependencyDialog = () => page.getByRole('heading', { name: 'Choose the existing Instagram post', exact: true }).waitFor();
const dependencyUrl = id => page.locator(`[data-dependency-url="${id}"]`);
const dependencyInclude = id => page.locator(`[data-dependency-include="${id}"]`);
const applyDependencies = () => page.locator('#apply-dependencies').click();
const canonicalUrl = 'https://www.instagram.com/p/EXACT_DEPENDENCY_123/';
const assertNoExtraWork = () => {
  assert.deepEqual(nativeCalls, []); assert.deepEqual(nativeRequests, []); assert.deepEqual(externalRequests, []);
  assert.deepEqual(workerErrors, []); assert.equal(queue.runs.length, 1); assert.equal(runnerCalls.length, 1);
};
const assertFits = async () => {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page fits horizontally');
  if (await page.locator('#modal').isVisible()) assert(await page.locator('#modal').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Dependency dialog fits horizontally');
};
try {
  await page.goto(origin); await compose();
  assert.deepEqual(await page.locator('.destination.selected').evaluateAll(buttons => buttons.map(button => button.dataset.destination)), ['manychat']);
  assert.equal(await page.locator('[data-selected-story]').count(), 0, 'A stale enabled flag cannot select Story on load');
  await page.reload(); await page.getByRole('button', { name: 'Continue to Compose', exact: true }).click();
  await assertSelected(['manychat']); assert.equal((await savedDraft()).instagram.story.enabled, false);
  assert.equal(queue.login.items.manychat, undefined, 'Continue retains ManyChat even when only Instagram has a cached verified connection');
  assert.equal((await savedDraft()).captions.instagram, staleDraft.captions.instagram);

  // Rejected and cancelled dependency edits never alter the stored draft.
  const beforeDependency = await savedText();
  await page.getByRole('button', { name: 'Preview posts', exact: true }).click(); await dependencyDialog();
  assert.equal(await dependencyInclude('manychat').isChecked(), true);
  assert.equal(await dependencyUrl('instagramStory').count(), 0, 'ManyChat-only review has no stale Story dependency');
  await applyDependencies(); assert.equal(await page.locator('#modal').evaluate(el => el.open), true);
  assert.match(await page.locator('#dependency-error').innerText(), /exact.*Instagram.*(?:post|reel).*URL/i);
  for (const invalid of ['https://www.instagram.com/fixture/', 'https://instagram.com.evil.test/p/WRONG/']) {
    await dependencyUrl('manychat').fill(invalid); await applyDependencies();
    assert.equal(await page.locator('#modal').evaluate(el => el.open), true, 'Invalid links keep the dependency dialog open');
    assert.equal(await savedText(), beforeDependency); assert.deepEqual(runRequests, []);
  }
  await page.locator('#modal [data-dialog-close]').click();
  assert.equal(await savedText(), beforeDependency, 'Cancel retains every saved draft field');
  await page.getByRole('button', { name: 'Preview posts', exact: true }).click(); await dependencyDialog();
  await dependencyUrl('manychat').fill(canonicalUrl); await applyDependencies();
  await page.getByRole('heading', { name: 'Review posts', exact: true }).waitFor();
  await assertPreview(['manychat']); await assertSelected(['manychat']);
  assert.equal((await savedDraft()).instagram.story.enabled, false);
  assert.equal(await page.getByRole('button', { name: 'Run test', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await page.locator('[data-caption-tab="manychat"]').click();
  assert.equal(await page.locator('[data-manychat-post]').inputValue(), canonicalUrl, 'Resolved post link appears in the current ManyChat input');
  await preview(); await assertPreview(['manychat']);
  const runStarted = page.waitForResponse(response => response.url() === origin + '/api/runs' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Run test', exact: true }).click(); assert.equal((await runStarted).ok(), true);
  await page.getByRole('heading', { name: 'Activity', exact: true }).waitFor();
  await page.waitForFunction(async () => {
    const state = await (await fetch('/api/status')).json(); return !state.workerBusy && state.runs[0]?.status === 'completed';
  });
  assert.equal(runRequests.length, 1); assert.equal(runRequests[0].mode, 'TEST');
  assert.deepEqual(runRequests[0].draft.selected, ['manychat']); assert.equal(runRequests[0].draft.instagram.story.enabled, false);
  assert.deepEqual(queue.runs[0].items.map(item => [item.id, item.status]), [['manychat', 'dry_run']]);
  assert.deepEqual(runnerCalls, [{ id: 'manychat', postUrl: canonicalUrl, files: [] }]);
  assert.deepEqual(browserCalls, ['manychat']); assertNoExtraWork();

  // Ordinary feed deselection removes Story and retains ManyChat and captions.
  const allDraft = baseDraft(); allDraft.selected = ['instagram', 'x', 'manychat', 'instagramStory']; allDraft.instagram.story.enabled = true;
  await loadDraft(allDraft); await page.locator('[data-destination="instagram"]').click();
  await assertSelected(['x', 'manychat']); assert.equal((await savedDraft()).instagram.story.enabled, false);
  assert.equal((await savedDraft()).captions.instagram, allDraft.captions.instagram);

  // A local upload makes the feed preview eligible without any social destination.
  await loadDraft(allDraft);
  await page.locator('#file-input').setInputFiles({ name: 'Dependency fixture.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 600, height: 600, channels: 3, background: '#85a9b7' } }).png().toBuffer() });
  await page.getByText('Image ready.', { exact: true }).waitFor();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).mediaIds.length === 1, draftKey);
  const uploadedDraft = await savedDraft();
  await preview(); await assertPreview(['instagram', 'x', 'manychat', 'instagramStory']);
  await page.locator('[data-skip-destination="instagramStory"]').click();
  await assertPreview(['instagram', 'x', 'manychat']); await assertSelected(['instagram', 'x', 'manychat']);
  assert.equal((await savedDraft()).instagram.story.enabled, false, 'Skip Story updates the selection and flag'); assertNoExtraWork();

  // Preview Skip feed preserves both dependents and requires their source links.
  await loadDraft(uploadedDraft); await preview();
  if (await page.locator('html').getAttribute('data-theme') !== 'dark') await page.locator('[data-action="theme"]').click();
  const beforeSkip = await savedText();
  await page.locator('[data-skip-destination="instagram"]').click(); await dependencyDialog();
  assert.equal(await dependencyInclude('manychat').isChecked(), true); assert.equal(await dependencyInclude('instagramStory').isChecked(), true);
  assert.equal(await savedText(), beforeSkip, 'Pending feed skip is not saved before dependency review');
  await dependencyUrl('manychat').fill(canonicalUrl); await dependencyUrl('instagramStory').fill(canonicalUrl);
  await page.setViewportSize({ width: 390, height: 844 }); await assertFits(); await fs.mkdir('test-results', { recursive: true });
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  const headingContrast = await page.waitForFunction(() => {
    const luminance = color => {
      const rgb = color.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(value => {
        const channel = Number(value) / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      });
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const fg = luminance(getComputedStyle(document.querySelector('#dialog-title')).color);
    const bg = luminance(getComputedStyle(document.querySelector('#modal')).backgroundColor);
    const contrast = (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
    return contrast >= 4.5 ? contrast : false;
  });
  assert(await headingContrast.jsonValue() >= 4.5, 'Dark dependency heading has at least 4.5:1 contrast');
  await page.screenshot({ path: 'test-results/dependencies-dark-mobile-dialog.png' });
  await applyDependencies(); await page.getByRole('heading', { name: 'Review posts', exact: true }).waitFor();
  await assertPreview(['x', 'manychat', 'instagramStory']); await assertSelected(['x', 'manychat', 'instagramStory']);
  assert.equal((await savedDraft()).instagram.story.enabled, true); assert.equal((await savedDraft()).manychat.postUrl, canonicalUrl);
  assert.equal((await savedDraft()).instagram.story.sourcePostUrl, canonicalUrl);
  await assertFits(); await page.locator('#toasts button').evaluateAll(buttons => buttons.forEach(button => button.click()));
  await page.screenshot({ path: 'test-results/dependencies-dark-mobile-preview.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 }); assertNoExtraWork();

  // An operator can omit a dependent within the source-link dialog.
  const dependentsDraft = baseDraft(); dependentsDraft.selected = ['manychat', 'instagramStory']; dependentsDraft.instagram.story.enabled = true;
  await loadDraft(dependentsDraft);
  await page.getByRole('button', { name: 'Preview posts', exact: true }).click(); await dependencyDialog();
  await dependencyInclude('instagramStory').uncheck(); await dependencyUrl('manychat').fill(canonicalUrl); await applyDependencies();
  await page.getByRole('heading', { name: 'Review posts', exact: true }).waitFor();
  await assertPreview(['manychat']); await assertSelected(['manychat']); assert.equal((await savedDraft()).instagram.story.enabled, false);

  // Only this exists in preview and the visible Compose caption toolbar.
  await loadDraft(uploadedDraft); await preview();
  await page.locator('[data-preview-destination="manychat"] [data-only-destination="manychat"]').click(); await dependencyDialog();
  assert.equal(await dependencyUrl('instagramStory').count(), 0);
  await dependencyUrl('manychat').fill(canonicalUrl); await applyDependencies();
  await page.getByRole('heading', { name: 'Review posts', exact: true }).waitFor();
  await assertPreview(['manychat']); await assertSelected(['manychat']); assert.equal((await savedDraft()).instagram.story.enabled, false);
  await loadDraft(uploadedDraft); await page.locator('[data-caption-tab="manychat"]').click();
  await page.locator('[data-only-destination="manychat"]:visible').click(); await dependencyDialog();
  await dependencyUrl('manychat').fill(canonicalUrl); await applyDependencies();
  await page.locator('[data-action="preview"]').waitFor(); await assertSelected(['manychat']);
  assert.equal(await page.getByRole('heading', { name: 'Review posts', exact: true }).count(), 0, 'Compose Only this stays in Compose after resolving its link');
  assert.equal((await savedDraft()).instagram.story.enabled, false); assert.equal(await page.locator('[data-manychat-post]').inputValue(), canonicalUrl);
  await preview(); await assertPreview(['manychat']); assertNoExtraWork(); assert.deepEqual(errors, []);
  console.log('Dependency UI passed: stale Story flag stays off across reload and Continue; required, invalid, cancelled and exact links; one ManyChat-only TEST item; feed/Story skip rules; dependency omission; Only this in Compose and preview; responsive dark dialog and review. Offline fixture only.');
} finally {
  await browser.close(); await phoneTools.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await queue.persistChain;
  assert.equal(path.dirname(dataDir), path.resolve(os.tmpdir())); assert(path.basename(dataDir).startsWith('mrinal-dependencies-ui-'));
  await fs.rm(dataDir, { recursive: true, force: true });
}



