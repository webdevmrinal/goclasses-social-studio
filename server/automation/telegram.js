// Copyright (c) 2026 Mrinal. Telegram Web K channel automation; TEST never sends.
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { telegramChannelUrl, telegramHandle, telegramWebUrl } from '../../shared/telegram.js';
import { navigate, wait, readCaption, pasteCaption, verifyCaption, preparedButton, uploadImages, finishPost, InterventionError, AccountMismatchError, ReadinessError, NetworkError } from './utils.js';

const pane = page => page.locator('#column-center .chat.active');
const editorFor = page => pane(page).locator('.chat-input-main [data-chat-input-editor="tiptap"][contenteditable="true"]');
const photo = page => page.locator('.popup-send-photo.active');
const visible = locator => locator.isVisible().catch(() => false);
const canonical = text => String(text || '').replace(/\r\n/g, '\n').trim();
const attention = (status, message) => Object.assign(new InterventionError(message), { status });
export async function assertTelegramSession(page) {
  if (!page.url().startsWith('https://web.telegram.org/k/')) throw attention('needs_attention', 'Open Telegram Web K on the worker. Other Telegram clients are not controlled by this adapter.');
  if (await visible(page.locator('#auth-flow-root').getByRole('heading').first()) || await visible(page.locator('#page-auth')) || await visible(page.getByText(/Log in to Telegram by QR Code/i)) || await visible(page.locator('input[autocomplete="one-time-code"]'))) throw attention('needs_login', 'Sign in to Telegram Web on the worker, then click Open & check again. Nothing was sent.');
}
export async function telegramSurface(page, expected, peerId) {
  await assertTelegramSession(page);
  const surface = pane(page), heading = surface.locator('.topbar .user-title .peer-title'), editor = editorFor(page);
  if (await surface.count() !== 1 || await heading.count() !== 1 || canonical(await heading.innerText()) !== expected.channelName) throw new AccountMismatchError('Telegram did not open the exact configured channel name. Nothing was sent.');
  const peer = await heading.getAttribute('data-peer-id');
  if (!/^-\d+$/.test(peer || '') || peerId && peer !== peerId) throw new AccountMismatchError('The Telegram channel identity changed. Nothing was sent.');
  if (await editor.count() !== 1 || !await visible(editor) || await editor.getAttribute('data-peer-id') !== peer) throw attention('needs_access', 'Telegram has no editable broadcast composer for this channel. Check your channel posting permissions.');
  const broadcast = await editor.evaluate(el => el.getAttribute('aria-labelledby')?.split(' ').some(id => document.getElementById(id)?.textContent.trim() === 'Broadcast'));
  if (!broadcast) throw attention('needs_access', 'Telegram must show the channel Broadcast composer. Personal messages, groups, replies and suggestions are not supported.');
  // Web K uses the reply strip for ordinary URL previews too. Its native
  // link icon is distinct from Reply/Edit/Forward; those helpers are refused.
  if (await surface.evaluate(el => el.classList.contains('is-helper-active') && el.querySelector('.reply-icon .tgico')?.textContent !== '\ue9bb')) throw attention('needs_attention', 'Telegram has a reply, forward or edit in progress. Review it yourself before running.');
  return peer;
}
async function verifyPublicLink(page, expected, peerId) {
  const profile = page.locator('#column-right .profile-container.active');
  await pane(page).locator('.topbar .chat-info').click();
  await profile.locator('.profile-name .peer-title').waitFor({ state: 'visible', timeout: 15000 });
  try {
    if (canonical(await profile.locator('.sidebar-header__title').first().innerText()) !== 'Channel Info' || await profile.locator('.profile-name .peer-title').getAttribute('data-peer-id') !== peerId) throw new AccountMismatchError('Telegram opened a group or a different channel profile. Nothing was sent.');
    const linkRows = profile.locator('.row').filter({ has: page.locator('.row-subtitle').getByText('Link', { exact: true }) });
    if (await linkRows.count() !== 1) throw new AccountMismatchError('The Telegram channel has no unique public Link row.');
    const shown = canonical(await linkRows.locator('.row-title').innerText()).replace(/^https:\/\//, '');
    if (telegramChannelUrl('https://' + shown) !== expected.channelUrl) throw new AccountMismatchError('The Telegram public username does not match Connections. Nothing was sent.');
  } finally {
    if (await visible(profile) && await profile.locator('.profile-name .peer-title').getAttribute('data-peer-id').catch(() => '') === peerId) await profile.locator('.sidebar-header').getByRole('button', { name: 'Close', exact: true }).click();
  }
  await telegramSurface(page, expected, peerId);
}
async function existingDraft(page) {
  for (const editor of await page.locator('#column-center .chat.active [data-chat-input-editor][contenteditable="true"]').all()) if (canonical(await readCaption(editor))) return true;
  return false;
}
export async function openTelegramChannel({ page, config, step = async () => {}, requireEmpty = false, readyTimeout = 90000 }) {
  const expected = config.platforms.telegram;
  if (!expected?.channelName || !telegramChannelUrl(expected.channelUrl)) throw attention('needs_setup', 'Set the exact Telegram channel name and public channel URL in Connections.');
  if (await visible(page.locator('.popup.active'))) throw attention('needs_attention', 'Telegram already has an open dialog or unsent media selection. Review it yourself before running.');
  const target = telegramWebUrl(expected.channelUrl);
  const current = page.url(), onTarget = current === target && await visible(pane(page).locator('.topbar .chat-info'));
  if (!onTarget) {
    if (current.startsWith('https://web.telegram.org/') && await existingDraft(page)) throw attention('needs_attention', 'Telegram has an unsent draft in the current conversation. It was preserved. Clear or save it yourself before opening the channel.');
    if (current.startsWith('https://web.telegram.org/') && !current.startsWith('https://web.telegram.org/k/')) throw attention('needs_attention', 'Use Telegram Web K (web.telegram.org/k/) on the worker. Close other Telegram tabs first.');
    await navigate(page, target, step);
  }
  await step('Waiting for Telegram, its linked session and channel controls…');
  const end = Date.now() + readyTimeout;
  while (!await visible(pane(page).locator('.topbar .chat-info'))) {
    await assertTelegramSession(page);
    if (Date.now() >= end) throw new ReadinessError('Telegram is still loading. Leave its worker tab open and try Open & check again.');
    await wait(300);
  }
  const peerId = await telegramSurface(page, expected);
  const hasDraft = canonical(await readCaption(editorFor(page))) !== '';
  if (requireEmpty && hasDraft) throw attention('needs_attention', 'The Telegram channel has an unsent draft. It was preserved for you to review; automation will not overwrite it.');
  await verifyPublicLink(page, expected, peerId);
  return { channelName: expected.channelName, channelUrl: expected.channelUrl, peerId, hasDraft };
}
export async function checkTelegramLogin(ctx) {
  try {
    const channel = await openTelegramChannel(ctx);
    return { status: 'verified', message: 'Telegram session, exact public channel and Broadcast permissions verified.' + (channel.hasDraft ? ' An unsent draft exists; review it before running.' : ' Every run checks again.'), channelUrl: channel.channelUrl };
  } catch (error) {
    return { status: error instanceof AccountMismatchError ? 'wrong_account' : error instanceof ReadinessError ? 'loading_timeout' : error instanceof NetworkError ? 'network_error' : error.status || 'verification_failed', message: error.message };
  }
}
export async function installTelegramGuard(page, channel) {
  const key = '__mrinalTelegram_' + randomUUID().replaceAll('-', '');
  await page.evaluate(({ key, channel }) => {
    const root = document.querySelector('#column-center .chat.active'), title = root.querySelector('.topbar .user-title .peer-title');
    const state = { root, title, channel, href: location.href, dirty: false, editing: false, armed: false, submitted: false };
    state.valid = () => !state.dirty && root.isConnected && root === document.querySelector('#column-center .chat.active') && title.isConnected && title.dataset.peerId === channel.peerId && title.textContent.trim() === channel.channelName && location.href === state.href;
    state.click = event => {
      const target = event.target instanceof Element ? event.target : event.target.parentElement;
      const button = target.closest('button,[role="button"],[role="menuitem"]');
      const isSend = button && (button.matches('.btn-send,.simple-message-input-confirm') || /^(Send|Schedule)(\b| )/i.test(button.getAttribute('aria-label') || button.textContent.trim()));
      if (isSend) {
        if (event.type !== 'click' || !state.armed || !state.valid() || button !== state.sendButton) { event.preventDefault(); event.stopImmediatePropagation(); return; }
        state.armed = false; state.submitted = true;
      }
      if (target.closest('#column-left [data-peer-id]') || target.closest('.bubbles-replies,.reply')) state.dirty = true;
    };
    state.keys = event => { if (event.key === 'Enter') { event.preventDefault(); event.stopImmediatePropagation(); } };
    state.input = event => { if (!state.editing && event.target.closest('[contenteditable="true"]')) state.dirty = true; };
    state.navigate = () => { state.dirty = true; };
    document.addEventListener('click', state.click, true);
    document.addEventListener('contextmenu', state.click, true);
    document.addEventListener('keydown', state.keys, true);
    document.addEventListener('beforeinput', state.input, true);
    document.addEventListener('input', state.input, true);
    window.addEventListener('hashchange', state.navigate);
    window[key] = state;
  }, { key, channel });
  return key;
}
export async function verifyTelegramGuard(page, key) {
  await assertTelegramSession(page);
  if (!await page.evaluate(key => window[key]?.valid() === true, key)) throw attention('needs_attention', 'Telegram navigation or the prepared draft changed. Nothing further was sent; review the worker before retrying.');
}
async function removeGuard(page, key) {
  await page.evaluate(key => {
    const s = window[key]; if (!s) return;
    document.removeEventListener('click', s.click, true); document.removeEventListener('contextmenu', s.click, true); document.removeEventListener('keydown', s.keys, true);
    document.removeEventListener('beforeinput', s.input, true); document.removeEventListener('input', s.input, true); window.removeEventListener('hashchange', s.navigate); delete window[key];
  }, key).catch(() => {});
}
async function editOwnDraft(page, key, action) {
  await verifyTelegramGuard(page, key); await page.evaluate(key => { window[key].editing = true; }, key);
  try { return await action(); } finally { await page.evaluate(key => { if (window[key]) window[key].editing = false; }, key).catch(() => {}); }
}
async function verifyPhotoOrder(page, hashes) {
  const preview = photo(page);
  const actual = await preview.locator('.popup-photo .popup-item-media img').evaluateAll(async images => Promise.all(images.map(async img => {
    if (!img.complete || !img.naturalWidth || !img.src.startsWith('blob:')) return null;
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await (await fetch(img.src)).arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('');
  })));
  if (JSON.stringify(actual) !== JSON.stringify(hashes)) throw new Error('Telegram image count, content or order does not match the reviewed selection. Nothing was sent.');
  if (hashes.length > 1 && (await preview.locator('.popup-photo > .popup-item-album').count() !== 1 || await preview.locator('.popup-photo > .popup-item-album > .popup-item-media').count() !== hashes.length)) throw new Error('Telegram images are not grouped into one reviewed album. Nothing was sent.');
}
async function cleanupOwnDraft(page, key, caption, hasImages, editor, hashes) {
  await verifyTelegramGuard(page, key);
  if (hasImages && await visible(photo(page))) await verifyPhotoOrder(page, hashes);
  const text = canonical(await readCaption(editor));
  if (text && text !== canonical(caption)) throw attention('needs_attention', 'Your changed Telegram draft was preserved for review.');
  if (hasImages && await visible(photo(page))) await photo(page).getByRole('button', { name: 'Close', exact: true }).click();
  const current = canonical(await readCaption(editorFor(page)));
  if (current && current !== canonical(caption)) throw attention('needs_attention', 'Your changed Telegram draft was preserved for review.');
  if (current) await editOwnDraft(page, key, async () => {
    const box = editorFor(page); await box.click(); await box.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A'); await box.press('Backspace');
  });
  if (canonical(await readCaption(editorFor(page)))) throw attention('needs_attention', 'Telegram rehearsal text could not be cleared. Review the unsent draft.');
}
export async function telegramRecords(page, peerId) {
  return pane(page).locator('.bubble.channel-post[data-mid]').evaluateAll((elements, peer) => elements.filter(e => e.dataset.peerId === peer).map(e => {
    const body = e.querySelector('.message')?.cloneNode(true);
    body?.querySelectorAll('.time,reactions-element,.reactions,.clearfix').forEach(e => e.remove());
    const text = n => n.nodeType === Node.TEXT_NODE ? n.textContent : n.nodeName === 'IMG' ? n.getAttribute('alt') || '' : n.nodeName === 'BR' ? '\n' : [...n.childNodes].map(text).join('');
    const count = e.querySelectorAll('.album-item[data-mid]').length || (e.classList.contains('photo') ? 1 : 0);
    return { mid: e.dataset.mid, timestamp: Number(e.dataset.timestamp), text: body ? text(body) : '', count, pending: /is-sending|is-pending|is-error|is-failed/.test(e.className) || !!e.querySelector('.time-icon-clock,.time-icon-sending,.time-icon-error'), native: !!e.querySelector('.time-inner[title]') && Number(e.dataset.mid) > 0 };
  }), peerId);
}
export async function confirmTelegramPublication({ page, expected, channel, caption, baseline, imageCount, startedAt, verifyContext = async () => {}, timeout = 60000 }) {
  const end = Date.now() + timeout, previous = new Set(baseline.map(r => r.mid)); let stable, hits = 0;
  const norm = text => canonical(text).replace(/\s+/gu, ' ');
  do {
    await telegramSurface(page, expected, channel.peerId); await verifyContext();
    const records = await telegramRecords(page, channel.peerId);
    const matches = records.filter(r => !previous.has(r.mid) && r.timestamp >= Math.floor(startedAt / 1000) - 2 && r.native && !r.pending && r.count === imageCount && norm(r.text) === norm(caption));
    if (matches.length === 1) {
      hits = stable === matches[0].mid ? hits + 1 : 1; stable = matches[0].mid;
      if (hits >= 3) {
        const bubble = pane(page).locator('.bubble.channel-post[data-mid="' + stable + '"]');
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://web.telegram.org' });
        await page.evaluate(() => navigator.clipboard.writeText(''));
        await bubble.locator('.message').click({ button: 'right' });
        try {
          await page.locator('#bubble-contextmenu.active').getByRole('menuitem', { name: 'Copy Message Link', exact: true }).click();
          const link = await page.evaluate(() => navigator.clipboard.readText());
          const url = new URL(link), handle = telegramHandle(expected.channelUrl);
          if (url.origin !== 'https://t.me' || !new RegExp('^/' + handle + '/[1-9][0-9]*$','i').test(url.pathname) || url.search || url.hash) throw new Error('Telegram returned a permalink for a different channel.');
          await verifyContext(); await telegramSurface(page, expected, channel.peerId);
          return { postUrl: url.href, channelName: channel.channelName, channelUrl: channel.channelUrl, nativeMessageId: stable, verifiedBy: 'new_channel_post_permalink', verifiedAt: new Date().toISOString() };
        } finally { if (await visible(page.locator('#bubble-contextmenu.active'))) await page.keyboard.press('Escape'); }
      }
    } else { hits = 0; stable = null; }
    await wait(300);
  } while (Date.now() < end);
  throw new Error('Telegram did not confirm a new matching channel post and native permalink. Verify the channel manually before retrying.');
}
export async function prepareTelegram(ctx) {
  const { page, config, files, caption, step, snapshot } = ctx, expected = config.platforms.telegram;
  if (!caption?.trim() || caption.length > (files.length ? 1024 : 4096) || files.length > 10) throw new Error('Telegram needs a caption within its text/photo limit and no more than 10 photos.');
  const channel = await openTelegramChannel({ ...ctx, requireEmpty: true });
  await snapshot('account-verified', pane(page).locator('.topbar'));
  const baseline = await telegramRecords(page, channel.peerId), hashes = await Promise.all(files.map(async file => createHash('sha256').update(await fs.readFile(file)).digest('hex')));
  const guard = await installTelegramGuard(page, channel);
  let editor, preview, status, publication, startedAt, cleanupDone = false;
  try {
    if (files.length) {
      await pane(page).locator('.chat-input-main').getByRole('button', { name: 'Attach', exact: true }).click();
      await uploadImages(page, files, step, { trigger: page.locator('.btn-menu.active').getByRole('menuitem', { name: 'Photo or Video', exact: true }) });
      await photo(page).waitFor({ state: 'visible', timeout: 60000 });
      preview = photo(page).locator('[role="dialog"]'); editor = preview.locator('[data-chat-input-editor="tiptap"][contenteditable="true"]');
      await verifyPhotoOrder(page, hashes); await snapshot('album-prepared', preview);
    } else { editor = editorFor(page); preview = pane(page).locator('.chat-input-main .rows-wrapper-wrapper'); }
    await editOwnDraft(page, guard, () => pasteCaption(page, editor, caption));
    const send = files.length ? preview.getByRole('button', { name: 'Send', exact: true }) : pane(page).locator('.chat-input-main').getByRole('button', { name: 'Send', exact: true });
    const preflight = async () => {
      await telegramSurface(page, expected, channel.peerId); await verifyTelegramGuard(page, guard);
      if (files.length) await verifyPhotoOrder(page, hashes); else await verifyPublicLink(page, expected, channel.peerId);
      if (await page.locator('.popup.active').count() !== (files.length ? 1 : 0)) throw attention('needs_attention', 'Telegram has an unexpected dialog. Nothing was sent.');
      await verifyCaption(editor, caption); await preparedButton(page, send);
      await verifyTelegramGuard(page, guard);
    };
    await ctx.recordPreparation?.({ ...channel, imageCount: files.length, textOnly: !files.length });
    status = await finishPost({ ...ctx, preflight, snapshot: label => snapshot(label, label === 'published' && publication ? pane(page).locator('[data-mid="' + publication.nativeMessageId + '"]').first() : preview),
      publish: async () => {
        await verifyTelegramGuard(page, guard); await telegramSurface(page, expected, channel.peerId); await verifyCaption(editor, caption);
        if (files.length) await verifyPhotoOrder(page, hashes);
        startedAt = Date.now();
        await send.evaluate((button, key) => { window[key].sendButton = button; window[key].armed = true; }, guard);
        try {
          await send.click();
          if (!await page.evaluate(key => window[key]?.submitted === true, guard)) throw attention('needs_attention', 'Telegram blocked Send because the target or draft changed.');
        } finally { await page.evaluate(key => { if (window[key]) window[key].armed = false; }, guard).catch(() => {}); }
      },
      verify: async () => { publication = await confirmTelegramPublication({ page, expected, channel, caption, baseline, imageCount: files.length, startedAt, verifyContext: () => verifyTelegramGuard(page, guard), timeout: ctx.confirmationTimeout ?? 60000 }); }
    });
    if (status === 'dry_run') { await cleanupOwnDraft(page, guard, caption, !!files.length, editor, hashes); cleanupDone = true; await step('TEST complete · Send and Enter were blocked. Only the rehearsal draft was cleared.'); }
    return { status, ...(publication ? { publication } : {}) };
  } finally {
    if (ctx.mode !== 'LIVE' && !cleanupDone && editor) try { await cleanupOwnDraft(page, guard, caption, !!files.length, editor, hashes); } catch { /* Preserve changed human drafts and unknown targets. */ }
    await removeGuard(page, guard);
  }
}
