// Copyright (c) 2026 Mrinal. All rights reserved.
import { AccountMismatchError, InterventionError, waitUntilReady } from './utils.js';

function workspace(config) {
  let url;
  try { url = new URL(config.platforms.manychat.flowUrl); } catch { /* report a useful setup error below */ }
  const id = url?.pathname.split('/').filter(Boolean)[0];
  if (!url || url.origin !== 'https://app.manychat.com' || url.username || url.password || !/^fb\d+$/.test(id || '')) {
    throw new InterventionError('Set the exact HTTPS ManyChat workspace URL in Connections, then check again.');
  }
  return { origin: url.origin, id };
}

// A login check opens the library, never the new-automation builder or a draft.
export function manychatLoginUrl(config) {
  const { origin, id } = workspace(config);
  return origin + '/' + id + '/cms';
}

function assertWorkspace(page, expected) {
  const current = new URL(page.url());
  if (current.origin !== expected.origin || current.username || current.password) {
    throw new InterventionError('Sign in to ManyChat in the worker browser, then click Open & check again.');
  }
  const id = current.pathname.split('/').filter(Boolean)[0];
  if (/^fb\d+$/.test(id || '') && id !== expected.id) {
    throw new AccountMismatchError('ManyChat opened a different workspace. Switch to the workspace configured in Connections, then check again.');
  }
  if (id !== expected.id) throw new InterventionError('Open the configured ManyChat workspace after signing in, then click Open & check again.');
}

export async function verifyManychatAccount(page, config, { timeout = 60000 } = {}) {
  const expected = workspace(config);
  const handle = (config.platforms.instagram.handle || '').replace(/^@/, '').trim().toLowerCase();
  return waitUntilReady(page, async () => {
    assertWorkspace(page, expected);
    const proof = await page.evaluate(({ origin, id }) => {
      const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden],[aria-hidden="true"]');
      const controls = [...document.querySelectorAll('button,[role="button"],h1,h2')].filter(visible);
      const login = [...document.querySelectorAll('input[type="password"],input[autocomplete="one-time-code"]')].some(visible) ||
        controls.some(el => /^(?:log in|sign in)(?: to manychat)?$/i.test(el.innerText.trim()));
      const routes = new Set();
      for (const el of document.querySelectorAll('a[href]')) {
        if (!visible(el)) continue;
        let url; try { url = new URL(el.getAttribute('href'), location.href); } catch { continue; }
        if (url.origin !== origin || url.username || url.password) continue;
        const match = url.pathname.match(/^\/(fb\d+)\/(cms|dashboard|subscribers|chat|settings|ai)\/?$/);
        if (match?.[1] === id) routes.add(match[2]);
      }
      const header = [...document.querySelectorAll('[data-test-id="phone-preview-header"]')].filter(visible).map(el => el.innerText.trim()).filter(Boolean);
      const heading = [...document.querySelectorAll('h1,h2,h3,[role="heading"]')].some(el => visible(el) && /^When someone comments on$/i.test(el.innerText.trim()));
      const radio = [...document.querySelectorAll('[role="radio"],input[type="radio"]')].some(el => {
        if (!visible(el)) return false;
        const label = [el.getAttribute('aria-label'), el.innerText, ...(el.labels || [])].map(v => typeof v === 'string' ? v : v.innerText).filter(Boolean).join(' ').trim();
        return /(?:a specific|any|next) post or reel/i.test(label);
      });
      return { login, routes: [...routes], header, heading, radio };
    }, expected);
    // Never accept a signed-out overlay merely because cached workspace links remain.
    if (proof.login) throw new InterventionError('Sign in to ManyChat in the worker browser, then click Open & check again.');
    if (proof.header.length && (!handle || proof.header.some(value => value.replace(/^@/, '').toLowerCase() !== handle))) {
      throw new AccountMismatchError('ManyChat is connected to a different Instagram account. Check its Instagram connection before continuing.');
    }
    const shell = proof.routes.includes('cms') && proof.routes.some(route => route !== 'cms');
    const builder = proof.heading && proof.radio && proof.header.length > 0 && !!handle;
    if (shell || builder) return { workspace: expected.id, instagramHandle: proof.header.length ? handle : null, view: builder ? 'builder' : 'workspace' };
    return null;
  }, { timeout, message: 'ManyChat has not finished loading its workspace controls. Your session may still be signed in. Leave the worker tab open and try Open & check again.' });
}
