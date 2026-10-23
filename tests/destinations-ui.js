// Copyright (c) 2026 Mrinal. Isolated UI/queue fixtures; never opens social sites.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { createApp } from '../server/index.js';
import { defaults } from '../server/config.js';
import { PLATFORMS } from '../shared/platforms.js';
async function imageOptions(asset) { const menu = asset.locator('.asset-options'); if (!await menu.evaluate(el => el.open)) await menu.locator('summary').click(); }

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mrinal-destination-ui-')), calls = [];
let fail = true;
const { app, queue } = await createApp({ dataDir, browser: { page: async () => ({ isClosed: () => true }) }, queueOptions: { runner: async ctx => { assert.equal(ctx.mode, 'TEST'); assert.equal(ctx.confirmedLive, false); calls.push({ id: ctx.id, files: ctx.files.map(file => path.basename(file)) }); if (fail) throw Error('Offline fixture failure'); return 'dry_run'; } } });
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
const config = structuredClone(defaults); config.platforms.instagram.handle = 'goclasses_cse'; config.platforms.x.handle = 'GOClasses_CSE'; config.platforms.youtubeCS.channelId = 'UCyvbBJhLJ-5YqwPA884vj0Q'; config.platforms.youtubeDA.channelId = 'UCkOaW747107QQNo-o0yhJGg';
await fetch(origin + '/api/config', { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
const browser = await chromium.launch({ headless: true });
await fs.mkdir('test-results', { recursive: true });
const errors = [], page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const editor = id => page.locator(`#editor-${id}`);
const selectTab = async id => { await page.locator(`[data-caption-tab="${id}"]`).click(); };
const tab = async id => { await selectTab(id); const options = editor(id).locator('.image-options'); if (await options.count() && !await options.evaluate(el => el.open)) await options.locator('summary').click(); };
const libraryLayouts = [];
const assertLibraryFits = async viewport => {
  const layout = await page.locator('.asset-list').evaluate(el => ({
    horizontalOverflow: el.scrollWidth > el.clientWidth + 1,
    verticalOverflow: el.scrollHeight > el.clientHeight + 1,
    maxHeight: getComputedStyle(el).maxHeight,
    clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight,
    imageCount: el.children.length, tallestTile: Math.round(Math.max(...[...el.children].map(asset => asset.getBoundingClientRect().height))),
    clippedAssets: [...el.children].filter(asset => { const box = asset.getBoundingClientRect(), list = el.getBoundingClientRect(); return box.left < list.left - 1 || box.right > list.right + 1; }).length
  }));
  libraryLayouts.push({ viewport, ...layout });
  assert.equal(layout.horizontalOverflow, false, `${viewport}: the shared image library fits horizontally`);
  assert.equal(layout.verticalOverflow, false, `${viewport}: all image tiles use the page scroll`);
  assert.equal(layout.maxHeight, 'none', `${viewport}: the library has no inner height limit`);
  assert.equal(layout.clippedAssets, 0, `${viewport}: every image tile stays inside the library`);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${viewport}: no page overflow`);
};
const capture = async name => { await page.locator('.toast button').evaluateAll(buttons => buttons.forEach(button => button.click())); await page.screenshot({ path: `test-results/${name}.png`, fullPage: true }); };
try {
  await page.goto(origin); await page.getByRole('button', { name: 'Compose', exact: true }).click();
  await page.locator('[data-action="import"]').click(); await page.locator('#import-captions').fill(PLATFORMS.map(p => `=====${p.delimiter}=====\n${p.name} — a new chapter ✅\n\nhttps://www.goclasses.in/`).join('\n\n')); await page.locator('#parse-captions').click();
  const files = await Promise.all(['#86b1dc', '#91bca7', '#dcad83', '#b8a4d0', '#d999a3'].map(async (background, i) => ({ name: `GO Classes artwork ${i + 1}.png`, mimeType: 'image/png', buffer: await sharp({ create: { width: 600, height: 600, channels: 3, background } }).png().toBuffer() })));
  await page.locator('#file-input').setInputFiles(files); await page.getByText('Images ready.', { exact: true }).waitFor();
  assert.equal(await page.locator('.asset').count(), 5); await assertLibraryFits('desktop with five images');
  // Destination removal is visible without opening the full picker and never removes a shared asset.
  await selectTab('linkedin');
  assert.equal(await editor('linkedin').locator('.image-options').evaluate(el => el.open), false);
  assert.equal(await editor('linkedin').getByRole('button', { name: 'Remove all', exact: true }).isVisible(), true);
  assert.equal(await editor('linkedin').getByRole('button', { name: 'Use all', exact: true }).isVisible(), true);
  const linkedinRemove = editor('linkedin').locator('[data-remove-destination-media="linkedin"]').nth(1);
  const linkedinRemovedId = await linkedinRemove.getAttribute('data-media-id');
  assert.equal(await linkedinRemove.isVisible(), true); assert.match(await linkedinRemove.getAttribute('aria-label'), /Remove GO Classes artwork 2\.png from LinkedIn/);
  await linkedinRemove.click();
  assert.equal(await editor('linkedin').locator('.carousel-thumb').count(), 4); assert.equal(await page.locator('.asset').count(), 5);
  await tab('instagram'); assert.equal(await editor('instagram').locator('.image-choice.chosen').count(), 5);
  await tab('whatsapp'); assert.equal(await editor('whatsapp').locator('.image-choice.chosen').count(), 1);
  await page.reload(); await page.getByRole('button', { name: 'Compose', exact: true }).click(); await selectTab('linkedin');
  assert.equal(await editor('linkedin').locator('[data-remove-destination-media="linkedin"]').count(), 4);
  assert.equal(await editor('linkedin').locator(`[data-remove-destination-media="linkedin"][data-media-id="${linkedinRemovedId}"]`).count(), 0, 'LinkedIn removal survives reload');
  await editor('linkedin').getByRole('button', { name: 'Use all', exact: true }).click(); assert.equal(await editor('linkedin').locator('.carousel-thumb').count(), 5);
  await editor('linkedin').getByRole('button', { name: 'Remove all', exact: true }).click();
  assert.equal(await editor('linkedin').locator('.destination-image img').count(), 0); assert.equal(await page.locator('.asset').count(), 5);
  await tab('linkedin'); assert.equal(await editor('linkedin').locator('.image-choice.chosen').count(), 0);
  await page.getByRole('button', { name: 'Preview posts' }).click(); await page.getByRole('heading', { name: 'Review posts' }).waitFor();
  const linkedinPreview = page.locator('[data-preview-destination="linkedin"]');
  assert.equal(await linkedinPreview.locator('[data-site-preview="linkedin"] img').count(),0,'Text-only LinkedIn mockup has no photo');
  assert((await linkedinPreview.locator('.site-caption').innerText()).trim().length>0,'Text-only post displays the reviewed caption');
  assert.equal(await linkedinPreview.getByText('Included in run', { exact: true }).isVisible(), true, 'LinkedIn text-only posts remain eligible');
  await page.getByRole('button', { name: 'Keep editing' }).click(); await page.reload(); await page.getByRole('button', { name: 'Compose', exact: true }).click(); await tab('linkedin');
  assert.equal(await editor('linkedin').locator('.image-choice.chosen').count(), 0, 'LinkedIn text-only selection survives reload');
  await editor('linkedin').locator('[data-pick-media]').nth(2).click(); assert.equal(await editor('linkedin').locator('.image-choice.chosen').count(), 1);
  assert.match(await editor('linkedin').locator('.destination-image img').getAttribute('alt'), /artwork 3/);
  await editor('linkedin').getByRole('button', { name: 'Use all', exact: true }).click(); assert.equal(await editor('linkedin').locator('.image-choice.chosen').count(), 5);
  await tab('telegram'); await editor('telegram').getByRole('button', { name: 'Remove all', exact: true }).click();
  assert.match(await editor('telegram').locator('.text-only-placeholder').innerText(), /Text only/);
  await page.reload(); await page.getByRole('button', { name: 'Compose', exact: true }).click(); await tab('telegram');
  assert.equal(await editor('telegram').locator('.image-choice.chosen').count(), 0, 'Text-only selection survives reload');
  await editor('telegram').getByRole('button', { name: 'Use all', exact: true }).click(); assert.equal(await editor('telegram').locator('.image-choice.chosen').count(), 5);
  for (const id of ['linkedin', 'youtubeDA', 'youtubeCS', 'manychat', 'telegram']) await page.locator(`[data-destination="${id}"]`).click();
  await tab('x'); assert.match(await editor('x').locator('[data-editor-readiness]').innerText(), /Fix before running/);
  await editor('x').locator('[data-pick-media]').nth(4).click(); assert.equal(await editor('x').locator('.image-choice.chosen').count(), 4);
  const xIds = await editor('x').locator('.image-choice.chosen').evaluateAll(els => els.map(el => el.dataset.mediaId));
  await editor('x').locator('[data-destination-move][data-direction="1"]').first().click();
  await editor('x').getByRole('button', { name: 'Next image', exact: true }).click(); assert.match(await editor('x').locator('.image-count').innerText(), /2 \/ 4/);
  await tab('whatsapp'); assert.equal(await editor('whatsapp').locator('.image-choice.chosen').count(),1);
  await editor('whatsapp').locator('[data-pick-media]').nth(2).click(); assert.equal(await editor('whatsapp').locator('.image-choice.chosen').count(), 1);
  assert.match(await editor('whatsapp').locator('.destination-image img').getAttribute('alt'), /artwork 3/);
  const waId = await editor('whatsapp').locator('.image-choice.chosen').getAttribute('data-media-id');
  await tab('instagram'); assert.equal(await editor('instagram').locator('.image-choice.chosen').count(), 5);
  // Clean/undo replacements must propagate into existing custom selections.
  await imageOptions(page.locator('.asset').first());
  await page.locator('.asset').first().locator('[data-clean-media]').click(); await page.locator('.asset').first().locator('.metadata-chip').filter({ hasText: /^\s*Clean\s*$/ }).waitFor();
  await tab('x'); let selectedIds = await editor('x').locator('.image-choice.chosen').evaluateAll(els => els.map(el => el.dataset.mediaId)); assert(!selectedIds.includes(xIds[0])); assert.equal(selectedIds.length, 4);
  await page.getByRole('button', { name: 'Undo image change', exact: true }).click();
  selectedIds = await editor('x').locator('.image-choice.chosen').evaluateAll(els => els.map(el => el.dataset.mediaId)); assert.deepEqual(selectedIds, xIds);
  await page.locator('[data-action="theme"]').click(); assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await capture('destinations-dark-desktop');
  await page.setViewportSize({ width: 390, height: 844 }); await editor('x').scrollIntoViewIfNeeded();
  assert(await editor('x').locator('.image-picker').evaluate(el => el.scrollWidth > el.clientWidth));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await capture('destinations-dark-mobile');
  assert.equal(await editor('x').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Preview posts' }).click(); await page.getByRole('heading', { name: 'Review posts' }).waitFor();
  const xPreview = page.locator('[data-preview-destination="x"]'), waPreview = page.locator('[data-preview-destination="whatsapp"]');
  assert.equal(await xPreview.locator('.site-gallery img').count(), 4); assert.equal(await waPreview.locator('.carousel-thumb').count(), 1);
  assert.match(await xPreview.locator('.site-gallery img').first().getAttribute('alt'), /artwork 2/); assert.match(await waPreview.locator('.destination-image img').getAttribute('alt'), /artwork 3/);
  await page.getByRole('button', { name: 'Keep editing' }).click(); await tab('whatsapp'); await page.locator('#caption-whatsapp').fill('');
  await page.getByRole('button', { name: 'Preview posts' }).click(); await page.getByRole('heading', { name: 'Review posts' }).waitFor();
  assert.equal(await waPreview.count(),0); assert.equal(await page.getByRole('button', { name: 'Run test', exact: true }).isEnabled(), true);
  const started = page.waitForRequest(req => req.url().endsWith('/api/runs') && req.method() === 'POST'); await page.getByRole('button', { name: 'Run test', exact: true }).click();
  assert.deepEqual((await started).postDataJSON().draft.selected, ['instagram', 'x']);
  await page.getByRole('heading', { name: 'Activity' }).waitFor();
  await page.locator('[data-retry-platform="x"]').waitFor({ state: 'attached' });
  const failedCard = page.locator('.run-card').filter({ has: page.locator('[data-retry-platform="x"]') });
  if (!await failedCard.evaluate(el => el.open)) await failedCard.locator('.run-summary').click();
  await page.locator('[data-retry-platform="x"]').waitFor();
  assert.deepEqual(calls.map(c => c.files.length), [5, 4]); assert(!calls.some(c => c.id === 'whatsapp'));
  const firstRun = queue.runs[0]; assert.deepEqual(firstRun.mediaByPlatform.whatsapp, undefined); assert.deepEqual(firstRun.mediaByPlatform.x, [xIds[1], xIds[0], ...xIds.slice(2)]);
  fail = false; const retryRequest = page.waitForRequest(req => req.url().endsWith('/retry'));
  await page.locator('[data-retry-platform="x"]').click(); await page.getByRole('heading', { name: 'Retry X', exact: true }).waitFor(); await page.getByRole('button', { name: 'Retry in TEST', exact: true }).click();
  assert.deepEqual((await retryRequest).postDataJSON(), { mode: 'TEST', platform: 'x', metadataConsent:{}, captionConsent:null });
  await page.getByText('Test complete', { exact: true }).first().waitFor({ state: 'attached' });
  const retryCard = page.locator('.run-card').first();
  if (!await retryCard.evaluate(el => el.open)) await retryCard.locator('.run-summary').click();
  await page.getByText('Test complete', { exact: true }).first().waitFor(); assert.deepEqual(calls.map(c => c.id), ['instagram', 'x', 'x']);
  assert(await page.locator(`[data-run-id="${firstRun.id}"] [data-retry]:not([data-retry-platform])`).isVisible(), 'Bulk retry remains available');
  await page.reload(); await page.getByRole('button', { name: 'Compose', exact: true }).click(); assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await tab('whatsapp'); assert.equal(await editor('whatsapp').locator('.image-choice.chosen').getAttribute('data-media-id'), waId);
  await tab('instagram'); assert.match(await editor('instagram').locator('[data-editor-readiness="instagram"]').innerText(), /Last attempt needs review/);
  await page.locator('[data-action="theme"]').click(); assert.equal(await page.locator('html').getAttribute('data-theme'), 'light'); await capture('destinations-light-desktop');
  await page.locator('[data-action="theme"]').click(); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' }); await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  // Long names and ten assets must grow with the page instead of introducing nested scrolling.
  const extraFiles = await Promise.all(Array.from({ length: 5 }, async (_, i) => ({ name: `GO Classes artwork ${i + 6} ${'longfilenamewithoutspaces'.repeat(6)}.png`, mimeType: 'image/png', buffer: await sharp({ create: { width: 600, height: 600, channels: 3, background: '#86b1dc' } }).png().toBuffer() })));
  const uploaded = page.waitForResponse(response => response.url().endsWith('/api/upload') && response.request().method() === 'POST');
  await page.locator('#file-input').setInputFiles(extraFiles); assert.equal((await uploaded).ok(), true); await page.locator('.asset [data-remove]').nth(9).waitFor();
  assert.equal(await page.locator('.asset').count(), 10);
  const firstAsset = page.locator('.asset').first();
  assert.match(await firstAsset.locator('[data-remove]').innerText(), /Remove/);
  assert.match(await firstAsset.locator('[data-move][data-direction="-1"]').innerText(), /Move earlier/);
  assert.match(await firstAsset.locator('[data-move][data-direction="1"]').innerText(), /Move later/);
  await imageOptions(firstAsset); assert.equal(await firstAsset.getByRole('button', { name: 'Clean metadata', exact: true }).isVisible(), true); assert.equal(await firstAsset.getByRole('link', { name: 'Download', exact: true }).isVisible(), true);
  await assertLibraryFits('desktop with ten long image names'); await capture('destinations-library-desktop');
  await page.setViewportSize({ width: 375, height: 812 }); await assertLibraryFits('375px mobile with ten long image names'); await capture('destinations-library-mobile');
  assert.deepEqual(errors, []);
  console.log('Shared image library measurements: ' + JSON.stringify(libraryLayouts));
  console.log('Destination UI passed: visible per-destination removal, persistent LinkedIn and text-only selections, independent X/WhatsApp ordering, metadata undo, accurate previews, excluded uploads, retry controls, themes, and ten compact long-name assets without shared-library scrolling or page overflow. No social site was opened.');
} finally { await browser.close(); server.closeAllConnections(); server.close(); }
