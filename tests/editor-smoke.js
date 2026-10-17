// Copyright (c) 2026 Mrinal. Local fixtures only; no social requests or posts.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { readCaption, verifyCaption, pasteCaption, uploadImages, waitForImages, preparedButton } from '../server/automation/utils.js';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.route('**/*', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta charset="utf-8">
  <style>.ql-editor p{margin:18px 0}#plain,#contenteditable-root{white-space:pre-wrap}</style>
  <input id="search-upload" type="file" accept="image/*">
  <div role="dialog">
    <input id="post-upload" type="file" accept="image/*" multiple>
    <button id="choose" onclick="document.querySelector('#post-upload').click()">Select from computer</button>
    <div class="ql-editor" contenteditable="true"><p>नमस्ते ✅</p><p><br></p><p><br></p><p>Last line</p></div>
    <div id="plain" role="textbox" contenteditable="true"></div>
    <div id="draft-js" contenteditable="true" style="white-space:pre-wrap"><div data-contents="true"><div data-block="true"><div style="margin-bottom:8px"><span style="clip-path:circle(0% at center center)">🎓</span><span> 𝐆𝐀𝐓𝐄 | CS &amp; DA</span></div></div><div data-block="true"><div><br data-text="true"></div></div><div data-block="true"><div>Explore research opportunities! हिन्दी ✅</div></div></div></div>
    <div id="contenteditable-root" contenteditable="true">First<div><br></div><div><br></div><div>Last</div></div>
    <div id="previews"></div>
    <button id="publish" disabled>Post</button>
  </div>` }));
try {
  const page = await context.newPage();
  await page.goto('https://editor.test/');
  const rich = page.locator('.ql-editor');
  const expected = 'नमस्ते ✅\n\n\nLast line';
  assert.equal(await readCaption(rich), expected, 'Read paragraphs without adding CSS margin line breaks');
  await verifyCaption(rich, expected);
  await verifyCaption(page.locator('#contenteditable-root'), 'First\n\n\nLast');
  const xCaption = '🎓 𝐆𝐀𝐓𝐄 | CS & DA\n\nExplore research opportunities! हिन्दी ✅';
  assert.equal(await readCaption(page.locator('#draft-js')), xCaption, 'X blank blocks and hidden emoji text must produce exact logical caption lines');
  await verifyCaption(page.locator('#draft-js'), xCaption + '\n');
  await assert.rejects(verifyCaption(page.locator('#draft-js'), xCaption.replace('DA', 'CS')), /does not match/);
  await assert.rejects(verifyCaption(rich, expected.replace('\n\n\n', '\n\n')), /does not match/);
  await pasteCaption(page, page.locator('#plain'), 'Unicode 𝐆𝐀𝐓𝐄 ✅ हिन्दी\n\nCaption');
  await verifyCaption(page.locator('#plain'), 'Unicode 𝐆𝐀𝐓𝐄 ✅ हिन्दी\n\nCaption');

  const buffer = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#007aff' } }).png().toBuffer();
  const files = [{ name: 'image.png', mimeType: 'image/png', buffer }];
  await assert.rejects(uploadImages(page, files, async () => {}), /scoped to the active composer/);
  await uploadImages(page, files, async () => {}, { input: page.getByRole('dialog').locator('#post-upload') });
  assert.equal(await page.locator('#search-upload').evaluate(el => el.files.length), 0, 'Do not upload into an unrelated search field');
  assert.equal(await page.locator('#post-upload').evaluate(el => el.files.length), 1);
  await page.locator('#post-upload').setInputFiles([]);
  await uploadImages(page, files, async () => {}, { trigger: page.getByRole('button', { name: 'Select from computer', exact: true }) });
  assert.equal(await page.locator('#post-upload').evaluate(el => el.files.length), 1);
  await assert.rejects(uploadImages(page, [...files, ...files], async () => {}, { input: page.locator('#search-upload') }), /accepts one image/);

  await page.evaluate(src => setTimeout(() => {
    const img = new Image(); img.src = src; document.querySelector('#previews').append(img);
    document.querySelector('#publish').disabled = false;
  }, 350), `data:image/png;base64,${buffer.toString('base64')}`);
  const started = Date.now();
  await waitForImages(page, page.locator('#previews img'));
  assert(Date.now() - started >= 250, 'Wait for an actual loaded image preview');
  await preparedButton(page, page.getByRole('button', { name: 'Post', exact: true }));
  console.log('Editor checks passed: Unicode and intentional blank lines, caption mismatch rejection, composer-scoped uploads, file chooser, single-image limits, and loaded preview readiness.');
} finally { await browser.close(); }
