// Copyright (c) 2026 Mrinal. All rights reserved.
export class InterventionError extends Error { constructor(message) { super(message); this.name = 'InterventionError'; } }
export class AccountMismatchError extends InterventionError { constructor(message) { super(message); this.name = 'AccountMismatchError'; } }
export class ReadinessError extends InterventionError { constructor(message) { super(message); this.name = 'ReadinessError'; } }
export class NetworkError extends Error { constructor(message) { super(message); this.name = 'NetworkError'; } }
export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function waitUntilReady(page, read, { timeout = 60000, message = 'The page is still loading. Try the account check again.' } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await assertNoChallenge(page);
    try { const value = await read(); if (value) return value; }
    catch (error) { if (page.isClosed() || error instanceof InterventionError) throw error; }
    await wait(250);
  }
  throw new ReadinessError(message);
}

export async function navigate(page, url, step, { retryDelay = 10000 } = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await step(`Opening page${attempt ? ` · retry ${attempt}/3` : ''}…`);
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      if (response?.status() === 429 || response?.status() >= 500) throw new Error(`HTTP ${response.status()}`);
      return;
    } catch (error) {
      if (page.isClosed()) throw error;
      if (attempt === 3) throw new NetworkError(`Page could not load after 3 retries. Check the worker's connection. ${error.message}`);
      await wait(retryDelay * (attempt + 1));
    }
  }
}
export async function firstVisible(locators, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const locator of locators) {
      const candidate = locator.first();
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }
    await wait(200);
  }
  throw new Error('The expected control was not found. The platform may have changed its interface; inspect the error screenshot.');
}
export async function clickAny(locators, timeout) { await (await firstVisible(locators, timeout)).click(); }
export async function dismissCookies(page) {
  for (const name of [/^Decline optional cookies$/i, /^Only allow essential cookies$/i, /^Reject optional cookies$/i]) {
    const button = page.getByRole('button', { name });
    if (await button.isVisible().catch(() => false)) await button.click();
  }
}
export async function assertNoChallenge(page) {
  const url = page.url();
  if (/\/login|\/signin|accounts\.google\.com|\/checkpoint|\/challenge|\/i\/flow\/login/.test(url)) throw new InterventionError('Sign in or complete the security check in the worker browser, then choose Continue.');
  const challenge = page.locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], input[autocomplete="one-time-code"]');
  if (await challenge.first().isVisible().catch(() => false)) throw new InterventionError('Complete the CAPTCHA or two-factor check in the worker browser, then choose Continue.');
}
export async function pasteCaption(page, locator, text) {
  await locator.click();
  try {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
    await page.evaluate(value => navigator.clipboard.writeText(value), text);
    await locator.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await locator.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
    const current = await readCaption(locator);
    if (current.replace(/\r\n/g, '\n').trim() === text.replace(/\r\n/g, '\n').trim()) return;
  } catch { /* fill() inserts complete Unicode strings without keyboard-layout dependence. */ }
  if (await locator.locator('[data-contents="true"]').count() || await locator.getAttribute('data-lexical-editor') === 'true' || await locator.getAttribute('data-chat-input-editor') === 'tiptap') {
    // Draft.js owns its DOM. fill() bypasses that state and can append duplicate
    // text on the next React update. Fail safely rather than mutate it directly.
    throw new Error('The rich-text editor did not accept the caption through the clipboard. Nothing was published; retry after checking the active composer.');
  }
  await locator.fill(text);
  await verifyCaption(locator, text);
}
export async function verifyCaption(locator, text) {
  const current = await readCaption(locator);
  if (current.replace(/\r\n/g, '\n').trim() !== text.replace(/\r\n/g, '\n').trim()) throw new Error('The caption in the active composer does not match the reviewed draft. Nothing was published.');
}
export async function readCaption(locator) {
  return locator.evaluate(el => {
    if ('value' in el) return el.value;
    // X/Draft.js has one data-block per logical line. innerText adds visual
    // newlines around empty blocks and is not the underlying caption.
    if (el.querySelector('[data-contents="true"]')) return [...el.querySelectorAll('[data-block="true"]')].map(block => block.textContent).join('\n');
    if (el.getAttribute('data-lexical-editor') === 'true' || el.getAttribute('data-chat-input-editor') === 'tiptap') {
      const text = node => node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeName === 'IMG' ? node.getAttribute('alt') || '' : node.nodeName === 'BR' ? (node.classList.contains('ProseMirror-trailingBreak') ? '' : '\n') : [...node.childNodes].map(text).join('');
      return [...el.children].map(block => block.childNodes.length === 1 && block.firstChild.nodeName === 'BR' ? '' : text(block)).join('\n');
    }
    // Quill stores one paragraph per newline. innerText adds extra newlines
    // for paragraph margins, even when the underlying caption is unchanged.
    if (el.classList.contains('ql-editor')) return [...el.children].map(line => line.childNodes.length === 1 && line.firstChild.nodeName === 'BR' ? '' : line.innerText).join('\n');
    // YouTube uses an initial text node followed by one div per line. A blank
    // div contains a placeholder br; innerText counts that blank line twice.
    if (el.id === 'contenteditable-root') return [...el.childNodes].map((line, index) => {
      if (line.nodeType === Node.TEXT_NODE) return line.textContent;
      if (line.nodeName === 'BR') return '\n';
      const content = line.childNodes.length === 1 && line.firstChild.nodeName === 'BR' ? '' : line.innerText;
      return (line.nodeName === 'DIV' && index > 0 ? '\n' : '') + content;
    }).join('');
    return el.innerText;
  });
}
export async function waitForImages(page, images, count = 1) {
  await waitUntilReady(page, () => images.evaluateAll((els, minimum) => els.filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && el.complete && el.naturalWidth > 0).length >= minimum, count), { timeout: 60000, message: 'The image preview did not finish loading. Nothing was published; check the composer and retry.' });
}
export async function preparedButton(page, button) {
  await waitUntilReady(page, async () => await button.isVisible() && await button.isEnabled() && await button.getAttribute('aria-disabled') !== 'true', { timeout: 60000, message: 'The platform has not enabled the final publish button. Check the caption and image preview. Nothing was published.' });
}
export async function uploadImages(page, files, step, { input, trigger } = {}) {
  await step('Uploading images…');
  if (trigger) {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 30000 }), trigger.click()]);
    if (files.length > 1 && !chooser.isMultiple()) throw new Error('This composer currently accepts one image. Remove additional images and try again.');
    await chooser.setFiles(files, { timeout: 60000 });
    return;
  }
  if (!input) throw new Error('An upload input scoped to the active composer is required.');
  await input.waitFor({ state: 'attached', timeout: 30000 });
  const multiple = await input.getAttribute('multiple');
  if (files.length > 1 && multiple === null) throw new Error('This composer currently accepts one image. Remove additional images and try again.');
  await input.setInputFiles(files, { timeout: 60000 });
}

// The only path that invokes a final publication action. Never retry this action.
export async function finishPost({ mode, confirmedLive, publish, verify, snapshot, step, markSubmitting, preflight }) {
  await preflight?.();
  await snapshot('ready-to-publish');
  if (mode !== 'LIVE') {
    await step('TEST complete · final publish action was not executed.');
    return 'dry_run';
  }
  if (confirmedLive !== true) throw new Error('Live publishing requires explicit confirmation for this run.');
  await preflight?.();
  await step('Publishing…');
  await markSubmitting(); // Persist before the side effect, including on process interruption.
  await publish();
  await verify();
  try { await snapshot('published'); }
  catch { try { await step('Publication confirmed. Its diagnostic screenshot was unavailable.'); } catch { /* Do not downgrade a confirmed publication because diagnostics failed. */ } }
  return 'posted';
}
