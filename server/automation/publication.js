// Copyright (c) 2026 Mrinal. Read-only confirmation of native publication records.
import { assertNoChallenge, wait, AccountMismatchError } from './utils.js';
import { instagramPostUrl } from '../../shared/manychat.js';

export function publicationUrl(id, value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (id === 'instagram' && /^(?:www\.)?instagram\.com$/.test(url.hostname) && /^\/p\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return instagramPostUrl(url.href);
    if (id === 'telegram' && url.hostname === 't.me' && /^\/[a-z][a-z0-9_]{4,31}\/[1-9][0-9]*\/?$/i.test(url.pathname) && !url.search && !url.hash) return 'https://t.me' + url.pathname.replace(/\/$/, '');
    if (id === 'linkedin' && url.hostname === 'www.linkedin.com' && /^\/feed\/update\/urn:li:(?:share|activity):\d+\/?$/.test(url.pathname)) return `https://www.linkedin.com${url.pathname.replace(/\/$/, '')}`;
    if (id.startsWith('youtube') && url.hostname === 'www.youtube.com' && /^\/post\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return `https://www.youtube.com${url.pathname.replace(/\/$/, '')}`;
  } catch { /* No valid native permalink. */ }
  return null;
}
const normalized = text => String(text || '').replace(/\s+/gu, ' ').trim();
const urlTokens = text => normalized(text).replace(/https?:\/\/[^\s<>]+/gu, '[link]');

export async function publicationRecords(page, id, expected) {
  const url = new URL(page.url());
  if (id === 'linkedin') {
    const company = new URL(expected.companyPageUrl).pathname.match(/^\/company\/([^/]+)\/admin\//)?.[1];
    if (url.origin !== 'https://www.linkedin.com' || !url.pathname.startsWith(`/company/${company}/admin/`)) throw new AccountMismatchError('Publication confirmation left the configured LinkedIn company admin page.');
  } else if (url.origin !== 'https://www.youtube.com' || url.pathname.startsWith('/channel/') && !url.pathname.startsWith(`/channel/${expected.channelId}/`)) throw new AccountMismatchError('Publication confirmation left the configured YouTube channel.');
  return page.evaluate(({ id, expected }) => {
    const norm = value => String(value || '').replace(/\s+/gu, ' ').trim();
    // Preserve emoji alt text and logical line breaks. YouTube shortens URL
    // labels but keeps their full destination in its redirect's q parameter.
    const text = node => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE || node.matches('.visually-hidden,script,style')) return '';
      if (node.tagName === 'IMG') return node.getAttribute('alt') || '';
      if (node.tagName === 'BR') return '\n';
      if (node.tagName === 'A') {
        try { const url = new URL(node.href); if (id.startsWith('youtube') && url.origin === 'https://www.youtube.com' && url.pathname === '/redirect' && /^https?:\/\//.test(url.searchParams.get('q') || '')) return url.searchParams.get('q'); } catch { /* Keep native text. */ }
      }
      return [...node.childNodes].map(text).join('');
    };
    const shown = el => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const records = [], receipts = [];
    if (id === 'linkedin') {
      const companyId = new URL(expected.companyPageUrl).pathname.split('/')[2];
      for (const modal of document.querySelectorAll('[role="dialog"]')) {
        if (!shown(modal) || !/Post successful\b/i.test(modal.innerText)) continue;
        for (const link of modal.querySelectorAll('a[href]')) {
          if (!shown(link) || norm(link.innerText) !== 'View post') continue;
          const url = new URL(link.href);
          if (url.hostname === 'www.linkedin.com' && url.searchParams.get('actorCompanyId') === companyId) receipts.push({ url: link.href, source: 'native_receipt' });
        }
      }
      for (const card of document.querySelectorAll('[data-urn^="urn:li:activity:"],[data-urn^="urn:li:share:"]')) {
        if (!shown(card)) continue;
        const content = card.querySelector('.update-components-update-v2__commentary,.update-components-text');
        const author = card.querySelector('.update-components-actor__name');
        const companyLink = card.querySelector('.update-components-actor a[href*="/company/"],a.update-components-actor__meta-link[href*="/company/"]');
        const authorText = author ? norm(text(author)) : '';
        const urn = card.getAttribute('data-urn');
        records.push({ id: urn, url: `https://www.linkedin.com/feed/update/${urn}`, text: content ? text(content) : '', authorMatches: authorText === expected.companyName && !!companyLink, images: new Set([...card.querySelectorAll('img[src*="/feedshare-"]')].map(img => img.src)).size });
      }
    } else {
      for (const card of document.querySelectorAll('ytd-backstage-post-renderer')) {
        if (!shown(card)) continue;
        const link = card.querySelector('#published-time-text a[href*="/post/"]');
        const author = card.querySelector('#author-text');
        const authorPath = author?.getAttribute('href')?.replace(/\/$/, '').toLowerCase();
        const authorMatches = norm(author?.textContent) === expected.channelName && [ `/@${expected.handle.toLowerCase()}`, `/channel/${expected.channelId.toLowerCase()}` ].includes(authorPath);
        if (link) records.push({ id: new URL(link.href).pathname.split('/').at(-1), url: link.href, text: card.querySelector('#content-text') ? text(card.querySelector('#content-text')) : '', authorMatches, images: new Set([...card.querySelectorAll('ytd-backstage-image-renderer img[src],ytd-post-multi-image-renderer img[src]')].map(img => img.src)).size });
      }
    }
    return { records, receipts };
  }, { id, expected });
}

export async function publicationBaseline(page, id, expected) {
  const { records, receipts } = await publicationRecords(page, id, expected);
  return [...new Set([...records, ...receipts].map(row => publicationUrl(id, row.url)).filter(Boolean))];
}

export async function confirmPublication({ page, id, expected, caption, baseline, imageCount = 0, timeout = 45000, signal }) {
  const previous = new Set(baseline), end = Date.now() + timeout;
  const refreshAfter = Date.now() + Math.min(5000, Math.max(250, timeout / 3));
  let stable, repeats = 0, refreshed = false, observer = page, probe;
  const abort=()=>probe?.close().catch(()=>{});signal?.addEventListener('abort',abort,{once:true});
  try{do {
    signal?.throwIfAborted();
    await assertNoChallenge(observer);
    const { records, receipts } = await publicationRecords(observer, id, expected);
    const candidates = new Map();
    for (const receipt of receipts) {
      const url = publicationUrl(id, receipt.url);
      if (url && !previous.has(url)) candidates.set(url, { postUrl: url, verifiedBy: 'native_receipt' });
    }
    // A visible native receipt is already tied to this company's submitted
    // post. Otherwise match one new feed card, its author, complete caption
    // (including expanded YouTube URLs), and published media presence.
    if (!candidates.size) for (const card of records) {
      const url = publicationUrl(id, card.url);
      const sameCaption = id === 'linkedin' ? urlTokens(card.text) === urlTokens(caption) : normalized(card.text) === normalized(caption);
      if (url && !previous.has(url) && card.authorMatches && sameCaption && (!imageCount || card.images > 0)) candidates.set(url, { postUrl: url, verifiedBy: 'new_feed_post', captionMatched: true });
    }
    if (candidates.size === 1) {
      const [key, proof] = [...candidates][0]; repeats = key === stable ? repeats + 1 : 1; stable = key;
      if (repeats >= 3) return { ...proof, verifiedAt: new Date().toISOString() };
    } else { repeats = 0; stable = undefined; }
    if (id.startsWith('youtube') && !candidates.size && !refreshed && Date.now() >= refreshAfter && Date.now() < end) {
      const feedUrl = `https://www.youtube.com/channel/${encodeURIComponent(expected.channelId)}/posts`;
      // Observe a fresh feed in an owned tab. YouTube leaves its empty inline
      // composer visible after Post; never discard that or a later human draft.
      signal?.throwIfAborted();refreshed=true;
      probe=await page.context().newPage();observer=probe;
      signal?.throwIfAborted();
      try{await probe.goto(feedUrl,{waitUntil:'domcontentloaded',timeout:Math.max(1,Math.min(15000,end-Date.now()))});}
      catch{signal?.throwIfAborted();throw new Error('YouTube publication may have occurred, but the read-only feed refresh did not complete. Verify the outcome before retrying.');}
      continue;
    }
    await wait(250);
  } while (Date.now() < end);
  throw new Error(`${id === 'linkedin' ? 'LinkedIn' : 'YouTube'} has not confirmed one new matching published post. Verify the outcome before retrying.`);
  }finally{signal?.removeEventListener('abort',abort);if(probe)await probe.close().catch(()=>{});}
}
