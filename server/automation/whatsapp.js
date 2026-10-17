// Copyright (c) 2026 Mrinal. All rights reserved.
// Channel UI only. No personal-chat lookup, Enter-to-send, or automatic retries.
import { randomUUID } from 'node:crypto';
import { whatsappChannelUrl } from '../../shared/whatsapp.js';
import { navigate, wait, readCaption, pasteCaption, verifyCaption, waitForImages, preparedButton, finishPost, InterventionError, AccountMismatchError, ReadinessError, NetworkError } from './utils.js';

const main = page => page.getByTestId('conversation-panel-wrapper');
const compose = page => main(page).getByTestId('conversation-compose-box-input');
const title = page => main(page).getByTestId('conversation-info-header-chat-title');
const photoEditor = page => page.getByTestId('media-caption-input-container');
export const whatsappMediaPreview = page => photoEditor(page).locator('xpath=ancestor::div[@tabindex="-1"][1]');
function attention(status, message) { const error = new InterventionError(message); error.status = status; return error; }
const visible = locator => locator.first().isVisible().catch(() => false);
const canonical = value => String(value).replace(/\r\n/g, '\n').trim();

export async function assertWhatsAppSession(page) {
  if (new URL(page.url()).origin !== 'https://web.whatsapp.com') throw attention('needs_login', 'Open WhatsApp Web on the worker and link this device again. Nothing was sent.');
  if (await visible(page.locator('[data-testid="qrcode"],[data-testid="qrcode-link-device"],[data-ref] canvas')) || await visible(page.getByRole('dialog').filter({ hasText: /you were logged out|session (?:has )?expired|log into WhatsApp/i }))) throw attention('needs_login', 'WhatsApp is logged out. Use Linked devices on your phone to link the worker browser, then continue. Nothing was sent.');
  if (await visible(page.getByRole('button', { name: /^Use here$|^Use WhatsApp here$/i }))) throw attention('needs_attention', 'WhatsApp is active in another window. Resolve its “Use here” prompt yourself, then continue. The worker will not take over another session.');
  const disconnected = page.locator('[role="alert"],[role="dialog"]').filter({ hasText: /computer not connected|phone not connected|waiting for network|connection (?:lost|unavailable)/i });
  if (await visible(disconnected)) throw attention('network_error', 'WhatsApp is disconnected. Restore its connection and continue. Nothing was sent.');
  if (!await visible(page.getByRole('button', { name: 'Channels', exact: true })) && await visible(page.getByText(/Log into WhatsApp|Steps to log in|Scan.*QR code|Link with phone number/i))) throw attention('needs_login', 'WhatsApp needs to be linked again. Scan the QR code on the worker using your phone; do not send login codes to this app.');
}
export async function waitForWhatsAppReady(page, { timeout = 90000 } = {}) {
  const end = Date.now() + timeout;
  do {
    await assertWhatsAppSession(page);
    const channels = page.getByRole('button', { name: 'Channels', exact: true });
    if (await visible(channels) && await channels.isEnabled() && await channels.getAttribute('aria-disabled') !== 'true') return;
    await wait(250);
  } while (Date.now() < end);
  throw new ReadinessError('WhatsApp is still loading after 90 seconds. Leave the worker tab open, wait for Channels to load, then continue. Nothing was sent.');
}
async function verifyChannelSurface(page, expected) {
  await assertWhatsAppSession(page);
  if (await title(page).count() !== 1 || (await title(page).innerText()).trim() !== expected.channelName) throw new AccountMismatchError('The open WhatsApp channel does not match Connections. Nothing was sent.');
  const editor = compose(page);
  if (await editor.count() !== 1 || await editor.getAttribute('aria-placeholder') !== 'Type an update') throw attention('needs_access', 'The open pane is not an editable WhatsApp Channel. The worker never uses a personal-chat message box. Check channel admin access.');
  if (await editor.getAttribute('contenteditable') !== 'true' || await editor.getAttribute('aria-readonly') === 'true' || !await editor.isEditable()) throw attention('needs_access', 'WhatsApp has not enabled the channel update composer. Check the session and channel admin access, then continue.');
  return editor;
}
async function waitForChannelSurface(page, expected, timeout) {
  const end = Date.now() + timeout;
  do {
    await assertWhatsAppSession(page);
    const heading = title(page), editor = compose(page);
    if (await heading.count() === 1 && (await heading.innerText()).trim() === expected.channelName && await editor.count() === 1 && await visible(editor) && await editor.getAttribute('aria-placeholder') === 'Type an update' && await editor.getAttribute('contenteditable') === 'true' && await editor.getAttribute('aria-readonly') !== 'true') return verifyChannelSurface(page, expected);
    await wait(200);
  } while (Date.now() < end);
  // Distinguish an unavailable admin composer from a mismatched channel only
  // after WhatsApp has had time to hydrate its update controls.
  return verifyChannelSurface(page, expected);
}
async function verifyChannelLink(page, expected) {
  const drawer = page.getByTestId('newsletter-link-drawer'), value = drawer.getByTestId('newsletter-link-drawer-copyable-link');
  if (await visible(value)) await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await main(page).getByTestId('conversation-header').getByRole('button', { name: 'Share', exact: true }).click();
  await value.waitFor({ state: 'visible', timeout: 15000 });
  try {
    const actual = whatsappChannelUrl((await value.innerText()).trim());
    if (actual !== expected.channelUrl) throw new AccountMismatchError('The WhatsApp channel name matches, but its unique channel link is different. Nothing was sent.');
  } finally { await drawer.getByRole('button', { name: 'Close', exact: true }).click(); }
}
export async function openWhatsAppChannel({ page, config, step = async () => {}, requireEmpty = false, readyTimeout = 90000, channelTimeout = 30000 }) {
  const expected = config.platforms.whatsapp;
  if (!expected?.channelName || !whatsappChannelUrl(expected.channelUrl)) throw attention('needs_setup', 'Add the exact WhatsApp channel name and public channel URL in Connections.');
  if (!page.url().startsWith('https://web.whatsapp.com/')) await navigate(page, 'https://web.whatsapp.com/', step);
  await step('Waiting for WhatsApp to load and checking its linked session…');
  await waitForWhatsAppReady(page, { timeout: readyTimeout });
  if (await visible(photoEditor(page))) throw attention('needs_attention', 'WhatsApp already has an unsent media selection. Review or discard it yourself before running automation.');
  await page.getByRole('button', { name: 'Channels', exact: true }).click();
  const channels = page.getByTestId('newsletter-tab-drawer');
  // This drawer wrapper can have a zero-size box while its positioned children
  // are visible. Wait on its actual Search control instead of the wrapper.
  await channels.getByRole('textbox', { name: 'Search', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  let entry = channels.getByTestId('cell-frame-title').getByText(expected.channelName, { exact: true });
  // Search only the Channels drawer, never WhatsApp's personal-chat search.
  if (await entry.count() === 0) await channels.getByRole('textbox', { name: 'Search', exact: true }).fill(expected.channelName);
  const end = Date.now() + 20000;
  while (await entry.count() === 0 && Date.now() < end) { await assertWhatsAppSession(page); await wait(250); }
  if (await entry.count() !== 1) throw new AccountMismatchError('The exact WhatsApp channel is missing or has duplicate names in Channels. Nothing was selected or sent. Check Connections and this linked account.');
  await entry.click();
  await title(page).waitFor({ state: 'visible', timeout: 30000 });
  const editor = await waitForChannelSurface(page, expected, channelTimeout);
  const existing = await readCaption(editor);
  if (requireEmpty && existing.trim()) throw attention('needs_attention', 'This WhatsApp channel already has an unsent text draft. Review or clear it yourself before running automation; the worker will not overwrite it.');
  await verifyChannelLink(page, expected);
  await verifyChannelSurface(page, expected);
  return { channelName: expected.channelName, channelUrl: expected.channelUrl, hasDraft: Boolean(existing.trim()) };
}
export async function checkWhatsAppLogin(ctx) {
  try {
    const channel = await openWhatsAppChannel(ctx);
    return { status: 'verified', message: `Linked session, exact channel name, unique channel link and admin composer verified.${channel.hasDraft ? ' An unsent draft exists; a run will pause until you review it.' : ''} Every run checks again.`, channelUrl: channel.channelUrl };
  } catch (error) {
    return { status: error instanceof AccountMismatchError ? 'wrong_account' : error instanceof ReadinessError ? 'loading_timeout' : error instanceof NetworkError ? 'network_error' : error.status || 'verification_failed', message: error.message };
  }
}

async function installGuard(page, expected) {
  const key = `__mrinalChannelGuard_${randomUUID().replaceAll('-', '')}`;
  await page.evaluate(({ key, expected }) => {
    const pane = document.querySelector('[data-testid="conversation-panel-wrapper"]'), heading = pane.querySelector('[data-testid="conversation-info-header-chat-title"]');
    const state = { pane, heading, expected, dirty: false, armed: false, editing: false };
    state.click = event => {
      const target = event.target instanceof Element ? event.target : event.target.parentElement;
      const button = target.closest('button,[role="button"]'), label = button?.getAttribute('aria-label') || button?.textContent?.trim() || '';
      if (/^Send(?: \d+ selected)?$/.test(label)) {
        const identityValid = !state.dirty && pane.isConnected && heading.isConnected && pane === document.querySelector('[data-testid="conversation-panel-wrapper"]') && heading.textContent.trim() === state.expected;
        if (!state.armed || !identityValid || button !== state.sendButton) { event.preventDefault(); event.stopImmediatePropagation(); return; }
        state.armed = false; state.submitted = true;
      }
      if (/^(Chats|Calls|Status|Channels|Communities|You)$/.test(label) || !pane.contains(target) && target.closest('[data-testid="cell-frame-container"],[role="row"]')) state.dirty = true;
    };
    state.keys = event => { if (event.key === 'Enter' && event.target.closest('[contenteditable="true"]')) { event.preventDefault(); event.stopImmediatePropagation(); } };
    state.input = event => { if (event.isTrusted && !state.editing && event.target.closest('[contenteditable="true"]')) state.dirty = true; };
    state.observer = new MutationObserver(() => { state.dirty = true; });
    state.observer.observe(heading, { childList: true, subtree: true, characterData: true });
    document.addEventListener('click', state.click, true); document.addEventListener('keydown', state.keys, true); document.addEventListener('beforeinput', state.input, true); document.addEventListener('input', state.input, true); window[key] = state;
  }, { key, expected: expected.channelName });
  return key;
}
async function verifyGuard(page, key) {
  const valid = await page.evaluate(key => { const state = window[key]; return state && !state.dirty && state.pane.isConnected && state.heading.isConnected && state.pane === document.querySelector('[data-testid="conversation-panel-wrapper"]') && state.heading.textContent.trim() === state.expected; }, key);
  if (!valid) throw attention('needs_attention', 'WhatsApp navigation or the channel identity changed after verification. Nothing was sent; review the worker channel and continue.');
}
async function removeGuard(page, key) {
  await page.evaluate(key => { const state = window[key]; if (!state) return; state.observer.disconnect(); document.removeEventListener('click', state.click, true); document.removeEventListener('keydown', state.keys, true); document.removeEventListener('beforeinput', state.input, true); document.removeEventListener('input', state.input, true); delete window[key]; }, key).catch(() => {});
}
async function editOwnDraft(page, key, operation) {
  await verifyGuard(page, key); await page.evaluate(key => { window[key].editing = true; }, key);
  try { return await operation(); } finally { await page.evaluate(key => { if (window[key]) window[key].editing = false; }, key).catch(() => {}); }
}
async function uploadChannelPhoto(page, file) {
  const key = `__mrinalChannelUpload_${randomUUID().replaceAll('-', '')}`;
  // WhatsApp creates a detached, single-file input. Capture its native click,
  // then use Playwright's file setter: no Explorer dialog is opened or left behind.
  await page.evaluate(key => {
    const original = HTMLInputElement.prototype.click;
    const state = { original, inputs: [] };
    state.capture = function (...args) { if (this.type === 'file' && this.accept.includes('image/') && this.accept.includes('video/')) { state.inputs.push(this); return; } return original.apply(this, args); };
    HTMLInputElement.prototype.click = state.capture; window[key] = state;
  }, key);
  let input;
  try {
    await main(page).getByRole('button', { name: 'Attach', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Photos & videos', exact: true }).click();
    const single = await page.evaluate(key => window[key].inputs.length === 1, key);
    if (!single) throw attention('needs_attention', 'WhatsApp did not open its expected channel photo input. Nothing was uploaded or sent.');
    input = (await page.evaluateHandle(key => window[key].inputs[0], key)).asElement();
  } finally {
    await page.evaluate(key => { const state = window[key]; if (!state) return; if (HTMLInputElement.prototype.click === state.capture) HTMLInputElement.prototype.click = state.original; delete window[key]; }, key).catch(() => {});
  }
  if (!input) throw new Error('WhatsApp channel photo input was unavailable.');
  try { await input.setInputFiles([file], { timeout: 60000 }); } finally { await input.dispose(); }
}
async function discardOwnPreview(page) {
  await whatsappMediaPreview(page).getByRole('button', { name: 'Close', exact: true }).click();
  const discard = page.getByRole('dialog').filter({ hasText: 'Discard selection?' });
  await discard.waitFor({ state: 'visible', timeout: 10000 });
  await discard.getByRole('button', { name: 'Discard', exact: true }).click();
  await photoEditor(page).waitFor({ state: 'hidden', timeout: 10000 });
}
async function clearOwnText(page, caption) {
  const editor = compose(page), current = canonical(await readCaption(editor));
  if (!current) return;
  if (current !== canonical(caption)) throw attention('needs_attention', 'WhatsApp has a changed unsent draft. It was preserved for your review. Nothing was sent.');
  await editor.click(); await editor.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A'); await editor.press('Backspace');
  if ((await readCaption(editor)).trim()) throw attention('needs_attention', 'WhatsApp rehearsal text could not be cleared. Review the unsent draft before continuing.');
}
export async function confirmWhatsAppPublication({ page, expected, caption, baseline, hasImage, timeout = 60000, verifyContext = async () => {} }) {
  const end = Date.now() + timeout; let stableId, confirmations = 0;
  do {
    await verifyChannelSurface(page, expected); await verifyContext();
    const candidates = await main(page).locator('[data-id]').evaluateAll((els, { previous, caption, hasImage }) => {
      const plain = node => node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeName === 'IMG' ? node.getAttribute('alt') || '' : node.nodeName === 'BR' ? '\n' : [...node.childNodes].map(plain).join('') + (/^(P|DIV)$/.test(node.nodeName) ? '\n' : '');
      const normalized = text => text.replace(/\s+/gu, ' ').trim();
      return [...new Set(els.filter(el => {
        const meta = el.querySelector('[data-testid="msg-meta"]');
        if (previous.includes(el.getAttribute('data-id')) || !meta) return false;
        if (el.querySelector('[data-testid="msg-time"],[data-icon="msg-time"],[data-testid="msg-error"]') || [...meta.querySelectorAll('svg title')].some(title => /clock|pending|schedule/i.test(title.textContent))) return false;
        // Native "Sent"/delivered acknowledgement is independent of audience
        // view counts, which can appear later or remain unavailable.
        const sent = [...meta.querySelectorAll('[aria-label]')].some(node => /^(sent|delivered|read)$/i.test(node.getAttribute('aria-label').trim())) || [...meta.querySelectorAll('svg title')].some(node => /^wds-ic-(delivered|read)$/.test(node.textContent));
        if (!sent) return false;
        const content = el.querySelector('[data-testid="image-caption selectable-text"]') || el.querySelector('[data-testid="selectable-text"]:not(img)');
        return content && normalized(plain(content)) === normalized(caption) && (!hasImage || !!el.querySelector('[data-testid="image-thumb"]'));
      }).map(el => el.getAttribute('data-id')))];
    }, { previous: baseline, caption, hasImage });
    if (candidates.length === 1) { confirmations = candidates[0] === stableId ? confirmations + 1 : 1; stableId = candidates[0]; if (confirmations >= 3) return { updateId: stableId, channelUrl: expected.channelUrl, channelName: expected.channelName, verifiedBy: 'sent_update', verifiedAt: new Date().toISOString() }; }
    else { stableId = undefined; confirmations = 0; }
    await wait(300);
  } while (Date.now() < end);
  throw new Error('WhatsApp did not confirm a newly sent channel update. Verify the channel manually before retrying.');
}
export async function prepareWhatsApp(ctx) {
  const { page, files, caption, config, step, snapshot } = ctx, expected = config.platforms.whatsapp;
  if (files.length > 1) throw new Error('WhatsApp Channels currently accepts one image per update in this worker. Choose one image or run WhatsApp separately.');
  const channel = await openWhatsAppChannel({ ...ctx, requireEmpty: true });
  await snapshot('account-verified', main(page).getByTestId('conversation-header'));
  // Capture existing updates before uploading: a native optimistic draft must
  // never become part of the pre-publication baseline.
  const before = await main(page).locator('[data-id]').evaluateAll(els => els.map(el => el.getAttribute('data-id')));
  const guard = await installGuard(page, expected);
  let editor, preview, result, publishedUpdateId, publication;
  try {
    if (files.length) {
      await step('Preparing one image in the verified WhatsApp channel…');
      await uploadChannelPhoto(page, files[0]);
      editor = photoEditor(page); await editor.waitFor({ state: 'visible', timeout: 60000 });
      preview = whatsappMediaPreview(page);
      await waitForImages(page, preview.getByTestId('media-editor-canvas').locator('img'));
      await snapshot('image-prepared', preview);
    } else { editor = compose(page); preview = main(page).locator('footer'); }
    await assertWhatsAppSession(page); await verifyGuard(page, guard);
    await editOwnDraft(page, guard, () => pasteCaption(page, editor, caption));
    const send = files.length ? preview.getByRole('button', { name: 'Send 1 selected', exact: true }) : main(page).getByRole('button', { name: 'Send', exact: true });
    const preflight = async () => {
      await assertWhatsAppSession(page); await verifyGuard(page, guard); await verifyChannelSurface(page, expected);
      if (await page.getByRole('dialog').filter({ hasNot: page.getByTestId('conversation-subheader') }).filter({ visible: true }).count()) throw attention('needs_attention', 'WhatsApp has an unexpected dialog. Review it on the worker before continuing. Nothing was sent.');
      // The native media editor disables the header's Share action. Its bound
      // channel is protected by the navigation/title guard instead; text-only
      // updates can also re-read the public link immediately before sending.
      if (!files.length) await verifyChannelLink(page, expected);
      await verifyCaption(editor, caption); await preparedButton(page, send);
      if (files.length) {
        if (await preview.getByRole('tab', { name: /^Open photo, / }).count() !== 1) throw new Error('WhatsApp attachment count changed. Nothing was sent.');
        await waitForImages(page, preview.getByTestId('media-editor-canvas').locator('img'));
      }
      await assertWhatsAppSession(page); await verifyGuard(page, guard);
    };
    await ctx.recordPreparation?.({ ...channel, imageCount: files.length, textOnly: !files.length });
    // Only IDs already visible in this channel are compared; chat history is not persisted.
    result = await finishPost({ ...ctx, preflight, snapshot: label => snapshot(label, label === 'published' && publishedUpdateId ? main(page).locator(`[data-id=${JSON.stringify(publishedUpdateId)}]`) : preview),
      publish: async () => {
        await assertWhatsAppSession(page); await verifyGuard(page, guard); await verifyCaption(editor, caption);
        await send.evaluate((button, key) => { window[key].sendButton = button; window[key].armed = true; }, guard);
        try {
          await send.click();
          if (!await page.evaluate(key => window[key]?.submitted === true, guard)) throw attention('needs_attention', 'WhatsApp blocked the final action because its verified channel or draft changed. Review the worker before retrying.');
        } finally { await page.evaluate(key => { if (window[key]) window[key].armed = false; }, guard).catch(() => {}); }
      },
      verify: async () => {
        publication = await confirmWhatsAppPublication({ page, expected, caption, baseline: before, hasImage: Boolean(files.length), timeout: ctx.confirmationTimeout ?? 60000, verifyContext: () => verifyGuard(page, guard) });
        publishedUpdateId = publication.updateId;
      }
    });
    if (result === 'dry_run') {
      await verifyGuard(page, guard); await verifyCaption(editor, caption);
      if (files.length) await discardOwnPreview(page);
      // WhatsApp can copy a discarded photo's caption back into the ordinary
      // update box. Clear it only when it is exactly our rehearsal text.
      await editOwnDraft(page, guard, () => clearOwnText(page, caption));
      await step('TEST complete · Send was blocked and never clicked. Only this rehearsal draft was discarded.');
    }
    return { status: result, ...(publication ? { publication } : {}) };
  } finally {
    if (ctx.mode !== 'LIVE' && result !== 'dry_run' && editor) {
      try {
        await verifyGuard(page, guard);
        const current = canonical(await readCaption(editor));
        if (!current || current === canonical(caption)) {
          if (files.length && await visible(editor)) { await discardOwnPreview(page); await editOwnDraft(page, guard, () => clearOwnText(page, caption)); }
          else if (!files.length && current) await editOwnDraft(page, guard, () => clearOwnText(page, caption));
        }
      } catch { /* Changed identity or user-edited text is preserved for review. */ }
    }
    await removeGuard(page, guard);
  }
}
