// Copyright (c) 2026 Mrinal. All rights reserved.
export const DEFAULT_REPLY_MESSAGES = [
  'Thanks for your interest! Please check your DMs.',
  'The details are on their way to your inbox.',
  'Check your DMs for the next step!',
  'Thanks for commenting! Take a look at your inbox.',
  'You can find the details in your DMs.',
  'Happy to help! Please check your inbox.',
  'Head to your DMs for the details.',
  'Thanks for reaching out! Check your DMs.',
  'We have a message for you in your inbox.',
  'Please check your DMs to continue.',
  'Your next step is in your inbox!',
  'Thanks! Look out for a DM from us.',
  'Have a look at your DMs for more.',
  'The information is waiting in your inbox.',
  'Glad you are interested! Check your DMs.',
  'Thanks for joining in! Please open your inbox.',
  'We will share the details in your DMs.',
  'Check your inbox when you get a moment!',
  'A quick message is waiting in your DMs.',
  'Thanks! Please head to your DMs for the details.'
];
export const normalizePostCaption = text => String(text || '').replace(/\s+/gu, ' ').trim();
export const DEFAULT_OPENING_DM = 'Hey there! I’m so happy you’re here, thanks so much for your interest 😊 \n\nClick below and I’ll send you the link in just a sec ✨';
export function instagramPostUrl(value) {
  try {
    const url = new URL(value, 'https://www.instagram.com');
    const match = url.pathname.match(/^\/(?:[\w.]+\/)?(p|reel)\/([\w-]+)\/?$/);
    return url.protocol === 'https:' && /^(?:www\.)?instagram\.com$/.test(url.hostname) && !url.username && !url.password && match ? `https://www.instagram.com/${match[1]}/${match[2]}/` : null;
  } catch { return null; }
}
export function manychatBuilderUrl(value) {
  const url = new URL(value);
  const workspace = url.pathname.split('/').filter(Boolean)[0];
  if (url.protocol !== 'https:' || url.hostname !== 'app.manychat.com' || !/^fb\d+$/.test(workspace || '')) throw new Error('Enter the ManyChat workspace automation URL from your browser.');
  return `${url.origin}/${workspace}/cms/easy-builder?campaign_type=easy_builder_cgt_next_post_multi_links`;
}
export function replyPool(value = DEFAULT_REPLY_MESSAGES.join('\n')) {
  const pool = [...new Set(String(value).split(/\r?\n/).map(line => line.trim()).filter(Boolean))];
  if (pool.length < 3 || pool.length > 50 || pool.some(line => [...line].length > 200)) throw new Error('Use 3–50 different comment replies, one per line, up to 200 characters each.');
  return pool;
}
export function replyBatch(value, offset = 0) {
  const pool = replyPool(value);
  return Array.from({ length: 3 }, (_, index) => pool[(Math.max(0, offset) + index) % pool.length]);
}
const buttonTitle = value => [...value].slice(0, 20).join('').trim();
function suggestedButtonLabel(context, url) {
  const clean = context.normalize('NFKC').replace(/https?:\/\/\S+|www\.\S+/g, '').replace(/[^\p{L}\p{N}\s&-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (clean && [...clean].length <= 20) return clean;
  const hints = `${clean} ${url.pathname}`;
  for (const [pattern, label] of [
    [/appl(?:y|ication)/i, 'Apply now'], [/brochure|prospectus/i, 'View brochure'],
    [/register|registration|enrol/i, 'Register now'], [/official|notification|notice/i, 'Official notice'],
    [/syllabus/i, 'View syllabus'], [/course|batch/i, 'Course details'], [/download/i, 'Download'],
    [/schedule|timetable/i, 'View schedule']
  ]) if (pattern.test(hints)) return label;
  const host = url.hostname.replace(/^www\./, '');
  if (/(^|\.)t\.me$|telegram/.test(host)) return 'Join Telegram';
  if (/whatsapp|wa\.me$/.test(host)) return 'Join WhatsApp';
  if (/youtube|youtu\.be$/.test(host)) return 'Watch on YouTube';
  if (/forms\.gle$|docs\.google\.com$/.test(host)) return 'Open form';
  return buttonTitle(`Open ${host}`);
}
// Keep the message unchanged; buttons are derived separately for review.
export function detectManychatLinks(message = '') {
  const text = String(message), found = [], seen = new Set();
  for (const match of text.matchAll(/(?:https?:\/\/|www\.)[^\s<>"\u200B]+/giu)) {
    let raw = match[0].replace(/[.,!;:]+$/g, '');
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
      while (raw.endsWith(close) && raw.split(close).length > raw.split(open).length) raw = raw.slice(0, -1);
    }
    let url;
    try { url = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw); } catch { continue; }
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const before = text.slice(0, match.index);
    const markdown = before.match(/\[([^\]\n]+)\]\(\s*$/)?.[1];
    const line = before.split(/\r?\n/).at(-1).trim();
    const context = markdown || line || before.trimEnd().split(/\r?\n/).at(-1) || '';
    found.push({ label: suggestedButtonLabel(context, url), url: url.href });
  }
  return found;
}
export function manychatLinks(value = {}, caption = '') {
  return value.linksMode === 'auto' || (!value.linksMode && !value.links?.length) ? detectManychatLinks(caption) : value.links ?? [];
}
export function validateManychatDraft(value = {}, caption = '') {
  const postUrl = value.postUrl ? instagramPostUrl(value.postUrl) : '';
  if (value.postUrl && !postUrl) throw new Error('ManyChat: enter an Instagram post or reel URL.');
  const links = manychatLinks(value, caption);
  if (!Array.isArray(links) || links.filter(link => link?.label || link?.url).length > 3) throw new Error('ManyChat accepts up to three link buttons. Review the detected links in Compose and remove any extra buttons.');
  const checked = links.filter(link => link?.label || link?.url).map(link => {
    if (typeof link.label !== 'string' || !link.label.trim() || [...link.label.trim()].length > 20) throw new Error('ManyChat: each link needs a button label of 1–20 characters.');
    let url;
    try { url = new URL(link.url); } catch { throw new Error('ManyChat: enter a complete HTTPS link.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2000) throw new Error('ManyChat: enter a complete HTTPS link without a password.');
    return { label: link.label.trim(), url: url.href };
  });
  return { postUrl, links: checked };
}
// Proof URLs come from a confirmed run, never from profile-grid relative links.
const manychatNativeUrl = (value, picker = false) => {
  if (typeof value !== 'string' || /[\\\u0000-\u0020]/u.test(value)) return null;
  const pattern = picker
    ? /^https:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(?:p|reel)\/[A-Za-z0-9_-]+\/?(?:[?#][^\s\\]*)?$/i
    : /^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/[A-Za-z0-9_-]+\/?(?:[?#][^\s\\]*)?$/i;
  return pattern.test(value) ? instagramPostUrl(value) : null;
};
const manychatProofUrl = value => manychatNativeUrl(value);
const manychatCardUrl = value => manychatNativeUrl(value, true);
export function manychatPublicationSource(publication) {
  if (!publication || typeof publication !== 'object' || Array.isArray(publication)) return null;
  const exact = Object.hasOwn(publication, 'postUrl');
  const postUrl = exact ? manychatProofUrl(publication.postUrl) : null;
  if (exact && !postUrl) return null;
  let candidates = [];
  if (Object.hasOwn(publication, 'candidates')) {
    if (!Array.isArray(publication.candidates)) return null;
    candidates = Array.from(publication.candidates, manychatProofUrl);
    if (candidates.some(url => !url)) return null;
    candidates = [...new Set(candidates)];
  }
  return postUrl || candidates.length ? { postUrl, candidates } : null;
}
export function selectPostCard(cards, { postUrl, publication, caption, mode }) {
  const unique = predicate => { const matches = cards.filter(predicate); return matches.length === 1 ? matches[0] : null; };
  if (postUrl) { const exact = manychatProofUrl(postUrl); return exact ? unique(card => manychatCardUrl(card.url) === exact) : null; }
  if (mode !== 'LIVE') return cards[0] || null;
  const source = manychatPublicationSource(publication);
  if (!source) return null;
  if (source.postUrl) return unique(card => manychatCardUrl(card.url) === source.postUrl);
  const expectedCaption = typeof caption === 'string' ? normalizePostCaption(caption) : '';
  if (!expectedCaption) return null;
  const candidates = new Set(source.candidates);
  return unique(card => candidates.has(manychatCardUrl(card.url)) && normalizePostCaption(card.caption) === expectedCaption);
}
