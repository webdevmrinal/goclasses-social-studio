// Copyright (c) 2026 Mrinal. Browser media preparation; final actions only through finishPost.
import path from 'node:path';
import fs from 'node:fs/promises';
import { firstVisible, clickAny, waitUntilReady, pasteCaption, verifyCaption, preparedButton, finishPost, InterventionError, assertNoChallenge, wait } from './utils.js';
import { prepareXSubmit } from './x-submit.js';
import { instagramBaseline, instagramPublication } from './instagram-reference.js';
import { publicationBaseline, publicationRecords, publicationUrl } from './publication.js';

export const selectedMediaKind = ctx => ctx.media?.[0]?.kind || 'image';
const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
const filename = file => typeof file === 'string' ? path.basename(file) : file?.name;
const reviewedFilename = ctx => selectedMediaKind(ctx) === 'document' ? path.basename(String(ctx.media?.[0]?.name || filename(ctx.files?.[0]) || 'Document.pdf').replace(/\\/g, '/')) : filename(ctx.files?.[0]);
const normalized = value => String(value || '').replace(/\s+/gu, ' ').trim();
const linksNormalized = value => normalized(value).replace(/https?:\/\/[^\s<>]+/gu, '[link]');

export function singleAttachment(ctx, kind) {
  if (ctx.files?.length !== 1 || ctx.media?.length !== 1 || ctx.media[0].kind !== kind) throw new InterventionError(`Choose exactly one ${kind === 'video' ? 'video' : 'PDF'} for this destination. Mixed attachment posts are not supported.`);
  const media = ctx.media[0];
  if (kind === 'video' && (!Number.isFinite(media.durationSeconds) || media.durationSeconds <= 0 || !Number.isFinite(media.width) || !Number.isFinite(media.height) || media.width <= 0 || media.height <= 0)) throw new InterventionError('This video has no verified duration or dimensions. Upload it again before continuing.');
  if (kind === 'document' && media.format !== 'pdf') throw new InterventionError('Choose a PDF document for this destination.');
  return media;
}

// Select an input only inside the active editor. Never use another page's
// upload control or open an OS file picker when a native input is available.
export async function uploadSingleAttachment(page, scope, ctx, kind, triggers = []) {
  singleAttachment(ctx, kind);
  await ctx.step(`Uploading ${kind === 'video' ? 'video' : 'PDF'}…`);
  const inputs = scope.locator('input[type="file"]'), compatible = [];
  for (let i = 0; i < await inputs.count(); i++) {
    const input = inputs.nth(i), accept = (await input.getAttribute('accept') || '').toLowerCase();
    if (!accept || kind === 'video' && /video|\.mp4|\.mov/.test(accept) || kind === 'document' && /pdf|application\/\*|\.doc|\.ppt/.test(accept)) compatible.push(input);
  }
  if (compatible.length > 1) throw new InterventionError('The active editor has more than one matching upload control. Select the attachment manually before continuing.');
  // Storage uses UUIDs. A document post should expose the reviewed PDF name,
  // while its bytes still come from the queue's integrity-checked owned file.
  const files = kind === 'document' ? [{ name: reviewedFilename(ctx), mimeType: 'application/pdf', buffer: typeof ctx.files[0] === 'string' ? await fs.readFile(ctx.files[0]) : ctx.files[0].buffer }] : ctx.files;
  if (compatible.length === 1) await compatible[0].setInputFiles(files, { timeout: 120000 });
  else {
    const trigger = await firstVisible(triggers, 10000);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), trigger.click()]);
    await chooser.setFiles(files, { timeout: 120000 });
  }
}

export async function assertEmptyMediaEditor(scope, label) {
  const old = await scope.evaluate(element => {
    const shown = el => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    return [...element.querySelectorAll('input[type="file"]')].some(input => input.files?.length) || [...element.querySelectorAll('video,iframe[src],embed[src],object[data],[data-testid="attachments"],.share-document-preview,.share-document')].some(shown);
  });
  if (old) throw new InterventionError(`${label} already has an attachment. Remove the old attachment in the worker before continuing. Nothing was published.`);
}

export async function videoPreview(scope, media, { timeout = 120000 } = {}) {
  return waitUntilReady(scope.page(), () => scope.locator('video').evaluateAll((elements, expected) => {
    const videos = elements.filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    if (videos.length !== 1) return null;
    const el = videos[0], duration = el.duration, width = el.videoWidth, height = el.videoHeight, source = el.currentSrc || el.getAttribute('src');
    if (!source || !Number.isFinite(duration) || duration <= 0 || el.readyState < 1 || width <= 0 || height <= 0 || el.error) return null;
    if (Math.abs(duration - expected.durationSeconds) > Math.max(0.5, expected.durationSeconds * 0.02)) return null;
    // Native players may transcode the preview. Preserve the reviewed aspect
    // ratio and duration instead of comparing transcoded byte hashes.
    const ratio = width / height, original = expected.width / expected.height;
    if (Math.abs(ratio - original) / original > 0.035) return null;
    const container = el.closest('[role="dialog"]') || el.parentElement;
    const busy = [...container.querySelectorAll('[role="progressbar"],progress')].filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden').some(node => {
      const current = Number(node.getAttribute('aria-valuenow') ?? node.getAttribute('value')), max = Number(node.getAttribute('aria-valuemax') ?? node.getAttribute('max') ?? 100);
      return !node.hasAttribute('aria-valuenow') && !node.hasAttribute('value') || !Number.isFinite(current) || current < max;
    });
    if (busy) return null;
    return { source, duration, width, height };
  }, media), { timeout, message: 'The video preview is still processing or does not match the reviewed duration and aspect ratio. Nothing was published.' });
}

export async function verifyVideoPreview(scope, media, proof) {
  const current = await videoPreview(scope, media, { timeout: 15000 });
  if (current.source !== proof.source || Math.abs(current.duration - proof.duration) > 0.1 || current.width !== proof.width || current.height !== proof.height) throw new InterventionError('The video attachment changed after preparation. Review the current video before continuing. Nothing was published.');
  return current;
}

async function verifySelectedFile(scope, ctx) {
  const names = await scope.locator('input[type="file"]').evaluateAll(inputs => inputs.flatMap(input => [...input.files || []].map(file => file.name)));
  // Platforms may release File objects once their upload completes. If one is
  // retained, it must still be the single reviewed upload.
  if (names.length && (names.length !== 1 || names[0] !== reviewedFilename(ctx))) throw new InterventionError('The upload input no longer matches the reviewed file. Nothing was published.');
}

export async function prepareInstagramReel(ctx) {
  const media = singleAttachment(ctx, 'video'), { page, caption, step, snapshot } = ctx;
  let baseline, publication;
  if (ctx.mode === 'LIVE' && ctx.captureInstagramPost) baseline = await instagramBaseline(page.context(), ctx.config.platforms.instagram.handle);
  await step('Opening the Instagram Reel composer…');
  await clickAny([page.getByRole('link', { name: /^create$/i }), page.getByRole('button', { name: /^create$/i }), page.locator('svg[aria-label="New post"]').locator('..')]);
  const select = page.getByRole('button', { name: 'Select from computer', exact: true });
  if (!await select.isVisible()) await (await firstVisible([page.getByRole('menuitem', { name: /^post$|^reel$/i }), page.getByText('Post', { exact: true })])).click();
  const upload = page.getByRole('dialog').filter({ has: select }).last();
  await upload.waitFor({ state: 'visible', timeout: 30000 });
  await assertEmptyMediaEditor(upload, 'Instagram');
  await uploadSingleAttachment(page, upload, ctx, 'video', [select]);
  await snapshot('video-uploaded');
  // Instagram can insert a Reels explanation before its crop/edit screens.
  const info = page.getByRole('dialog').filter({ hasText: /video posts are now shared as reels|your video will be shared as a reel/i }).last();
  if (await info.isVisible()) {
    const okay = info.getByRole('button', { name: /^(?:ok|got it)$/i });
    if (await okay.count() !== 1) throw new InterventionError('Review Instagram’s Reel notice in the worker before continuing. Nothing was published.');
    await okay.click();
  }
  let composer, editor;
  for (let stage = 0; stage < 4; stage++) {
    composer = page.getByRole('dialog').filter({ visible: true }).last();
    editor = composer.locator('[contenteditable="true"][role="textbox"],textarea[aria-label*="caption" i]');
    if (await editor.count() === 1 && await editor.isVisible()) break;
    await videoPreview(composer, media);
    const next = await firstVisible([composer.getByRole('button', { name: /^next$/i }), composer.getByRole('link', { name: /^next$/i })], 15000);
    await next.click();
    editor = null;
  }
  if (!editor) throw new InterventionError('Instagram did not reach the Reel caption screen. Continue to that screen in the worker; nothing was published.');
  const proof = await videoPreview(composer, media);
  await pasteCaption(page, editor, caption);
  await verifyCaption(editor, caption);
  const share = composer.getByRole('button', { name: /^share$/i });
  await preparedButton(page, share);
  await ctx.recordPreparation?.({ kind: 'video', format: 'reel', durationSeconds: media.durationSeconds });
  const result = await finishPost({ ...ctx,
    preflight: async () => { await verifyCaption(editor, caption); await verifySelectedFile(composer, ctx); await verifyVideoPreview(composer, media, proof); },
    publish: () => share.click(),
    verify: () => waitUntilReady(page, async () => {
      const notices = page.getByText(/your (?:post|reel) has been shared/i);
      for (let i = 0; i < await notices.count(); i++) if (await notices.nth(i).isVisible()) return true;
      return null;
    }, { timeout: 60000, message: 'Instagram has not confirmed the Reel publication. Verify its outcome before retrying.' })
  });
  if (result === 'posted' && baseline) publication = await instagramPublication(page.context(), ctx.config.platforms.instagram.handle, baseline, caption);
  await page.close().catch(() => {});
  return publication ? { status: result, publication } : result;
}

export async function openLinkedInComposer(ctx) {
  const { page, config, step } = ctx;
  await step('Opening the company composer…');
  const entry = await firstVisible([page.getByRole('button', { name: /start a post|create a post/i }), page.getByRole('link', { name: /^create$/i }), page.getByRole('button', { name: /^create$/i })]);
  const menu = (await entry.innerText()).trim() === 'Create'; await entry.click();
  if (menu) await page.getByRole('dialog', { name: 'Create', exact: true }).getByRole('link', { name: /^start a post/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Create post modal', exact: true });
  await dialog.waitFor({ state: 'visible', timeout: 30000 });
  await dialog.getByText(config.platforms.linkedin.companyName, { exact: true }).first().waitFor({ state: 'visible' });
  await assertEmptyMediaEditor(dialog, 'LinkedIn');
  return dialog;
}

async function finishLinkedInMedia(ctx, dialog, kind, proof, verifyAttachment) {
  const { page, caption, config } = ctx, expected = config.platforms.linkedin;
  let baseline = await publicationBaseline(page, 'linkedin', expected), publication;
  const editor = dialog.getByRole('textbox', { name: 'Text editor for creating content', exact: true });
  await pasteCaption(page, editor, caption);
  await verifyCaption(editor, caption);
  const post = dialog.getByRole('button', { name: 'Post', exact: true });
  await preparedButton(page, post);
  await ctx.recordPreparation?.({ kind, ...(kind === 'document' ? { documentTitle: proof.title } : { durationSeconds: ctx.media[0].durationSeconds }) });
  const result = await finishPost({ ...ctx,
    preflight: async () => {
      await verifyCaption(editor, caption); await verifySelectedFile(dialog, ctx); await verifyAttachment();
      baseline = [...new Set([...baseline, ...await publicationBaseline(page, 'linkedin', expected)])];
    },
    publish: () => post.click(),
    verify: async () => { publication = await confirmLinkedInMediaPublication({ page, expected, caption, baseline, kind, title: proof.title, signal: ctx.signal }); }
  });
  await page.close().catch(() => {});
  return publication ? { status: result, publication } : result;
}

export async function prepareLinkedInVideo(ctx) {
  const media = singleAttachment(ctx, 'video'), dialog = await openLinkedInComposer(ctx), { page } = ctx;
  const trigger = dialog.getByRole('button', { name: /add media|add a video|add video|upload video/i });
  await uploadSingleAttachment(page, dialog, ctx, 'video', [trigger]);
  const mediaDialog = page.getByRole('dialog', { name: /^(?:editor|video editor)$/i });
  await mediaDialog.waitFor({ state: 'visible', timeout: 60000 });
  await videoPreview(mediaDialog, media);
  await mediaDialog.getByRole('button', { name: 'Next', exact: true }).click();
  const proof = await videoPreview(dialog, media);
  await ctx.snapshot('video-uploaded');
  return finishLinkedInMedia(ctx, dialog, 'video', proof, () => verifyVideoPreview(dialog, media, proof));
}

export const documentPostTitle = media => [...String(media.documentTitle || media.name || 'Document').replace(/\.pdf$/i, '').replace(/[_\s]+/g, ' ').trim()].slice(0, 100).join('') || 'Document';
export async function documentPreview(scope, title, { timeout = 120000 } = {}) {
  return waitUntilReady(scope.page(), () => scope.evaluate((element, expected) => {
    const shown = el => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    const titles = [...element.querySelectorAll('input,textarea,[data-document-title],.share-document__title,.share-document-preview__title')].filter(shown).map(el => el.value ?? el.textContent ?? '');
    const labels = [...element.querySelectorAll('h1,h2,h3,span,p')].filter(shown).map(el => (el.textContent || '').trim());
    if (![...titles, ...labels].some(value => value.trim() === expected)) return null;
    const embeds = [...element.querySelectorAll('iframe[src],embed[src],object[data],canvas,.share-document-preview,.share-document')].filter(shown);
    const previews = embeds.filter(el => el.tagName !== 'CANVAS' || el.width > 0 && el.height > 0).map(el => ({ tag: el.tagName, source: el.getAttribute('src') || el.getAttribute('data') || '', label: el.getAttribute('aria-label') || '' }));
    if (!previews.length) return null;
    const busy = [...element.querySelectorAll('[role="progressbar"],progress')].filter(shown).some(el => !el.hasAttribute('aria-valuenow') && !el.hasAttribute('value') || Number(el.getAttribute('aria-valuenow') ?? el.getAttribute('value')) < Number(el.getAttribute('aria-valuemax') ?? el.getAttribute('max') ?? 100));
    return busy ? null : { title: expected, previews };
  }, title), { timeout, message: 'LinkedIn has not confirmed the PDF title and document preview. Nothing was published.' });
}

export async function prepareLinkedInDocument(ctx) {
  const media = singleAttachment(ctx, 'document'), title = documentPostTitle(media), dialog = await openLinkedInComposer(ctx), { page } = ctx;
  const documentButtons = [dialog.getByRole('button', { name: /^(?:add a document|add document|document)$/i }), dialog.getByRole('menuitem', { name: /^(?:add a document|add document|document)$/i })];
  if (!await documentButtons[0].isVisible().catch(() => false) && !await documentButtons[1].isVisible().catch(() => false)) await (await firstVisible([dialog.getByRole('button', { name: /^more$|more options|more post options|add more/i })], 10000)).click();
  await (await firstVisible(documentButtons, 10000)).click();
  const picker = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /choose file|upload from computer/i }) }).last();
  await picker.waitFor({ state: 'visible', timeout: 30000 });
  await uploadSingleAttachment(page, picker, ctx, 'document', [picker.getByRole('button', { name: /choose file|upload from computer/i })]);
  const titleInput = await firstVisible([picker.getByRole('textbox', { name: /document title|add a title|^title$/i }), picker.locator('input[placeholder*="title" i]')], 15000);
  await titleInput.fill(title);
  await documentPreview(picker, title);
  const done = picker.getByRole('button', { name: 'Done', exact: true }); await preparedButton(page, done); await done.click();
  const proof = await documentPreview(dialog, title);
  await ctx.snapshot('document-uploaded');
  return finishLinkedInMedia(ctx, dialog, 'document', proof, async () => {
    const current = await documentPreview(dialog, title, { timeout: 15000 });
    if (JSON.stringify(current) !== JSON.stringify(proof)) throw new InterventionError('The PDF preview changed after review. Nothing was published.');
  });
}

export async function prepareXVideo(ctx) {
  const media = singleAttachment(ctx, 'video'), { page, caption } = ctx;
  // The parent account-verification path already navigates to X; a dedicated
  // composer avoids confusing a timeline reply with the reviewed post.
  await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded' }); await assertNoChallenge(page);
  const dialog = page.getByRole('dialog').filter({ has: page.getByTestId('tweetTextarea_0') }).last();
  await dialog.waitFor({ state: 'visible', timeout: 60000 }); await assertEmptyMediaEditor(dialog, 'X');
  await uploadSingleAttachment(page, dialog, ctx, 'video');
  const proof = await videoPreview(dialog, media);
  await ctx.snapshot('video-uploaded');
  const editor = dialog.getByTestId('tweetTextarea_0'); await pasteCaption(page, editor, caption); await verifyCaption(editor, caption);
  const post = dialog.getByTestId('tweetButton'); let submission;
  await ctx.recordPreparation?.({ kind: 'video', durationSeconds: media.durationSeconds });
  const result = await finishPost({ ...ctx,
    preflight: async () => { await verifyCaption(editor, caption); await verifySelectedFile(dialog, ctx); await verifyVideoPreview(dialog, media, proof); submission = await prepareXSubmit(page, dialog, post); },
    publish: () => submission.publish(),
    verify: () => waitUntilReady(page, async () => {
      const sent = page.getByText(/your post was sent/i);
      for (let i = 0; i < await sent.count(); i++) if (await sent.nth(i).isVisible()) return true;
      return null;
    }, { timeout: 60000, message: 'X has not confirmed the video post. Verify its outcome before retrying.' })
  });
  await page.close().catch(() => {}); return result;
}

export async function confirmLinkedInMediaPublication({ page, expected, caption, baseline, kind, title, signal, timeout = 60000 }) {
  const previous = new Set(baseline), end = Date.now() + timeout; let last, repeats = 0;
  do {
    signal?.throwIfAborted(); await assertNoChallenge(page);
    const { records, receipts } = await publicationRecords(page, 'linkedin', expected), typed = await page.evaluate(() => {
      const shown = el => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
      return [...document.querySelectorAll('[data-urn^="urn:li:activity:"],[data-urn^="urn:li:share:"]')].filter(shown).map(card => ({ id: card.getAttribute('data-urn'), videos: [...card.querySelectorAll('video')].filter(shown).length, documents: [...card.querySelectorAll('.update-components-document,.update-components-document__container,iframe[src*="document"],a[href*="/document/"]')].filter(shown).length, title: [...card.querySelectorAll('.update-components-document__title,h3')].filter(shown).map(el => (el.textContent || '').trim()) }));
    });
    const candidates = new Map();
    for (const receipt of receipts) { const url = publicationUrl('linkedin', receipt.url); if (url && !previous.has(url)) candidates.set(url, { postUrl: url, verifiedBy: 'native_receipt' }); }
    if (!candidates.size) for (const record of records) {
      const url = publicationUrl('linkedin', record.url), attachment = typed.find(item => item.id === record.id);
      if (url && !previous.has(url) && record.authorMatches && linksNormalized(record.text) === linksNormalized(caption) && attachment && (kind === 'video' ? attachment.videos === 1 : attachment.documents > 0 && attachment.title.includes(title))) candidates.set(url, { postUrl: url, verifiedBy: 'new_feed_post', captionMatched: true, mediaKind: kind });
    }
    if (candidates.size === 1) { const [url, proof] = [...candidates][0]; repeats = last === url ? repeats + 1 : 1; last = url; if (repeats >= 3) return { ...proof, verifiedAt: new Date().toISOString() }; } else { last = undefined; repeats = 0; }
    await wait(250);
  } while (Date.now() < end);
  throw new Error('LinkedIn has not confirmed one new matching media post. Verify its outcome before retrying.');
}
