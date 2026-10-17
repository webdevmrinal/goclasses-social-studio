// Copyright (c) 2026 Mrinal. Intercepted native-post fixtures; no real site requests or Post clicks.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { defaults } from '../server/config.js';
import { confirmPublication, publicationBaseline } from '../server/automation/publication.js';
const expectedLi = defaults.platforms.linkedin;
const expectedYt = { ...defaults.platforms.youtubeDA, channelId: 'UCkOaW747107QQNo-o0yhJGg' };
const caption = '💼 IRCON update\n\nApply: https://example.com/apply?course=CS&n=2\n#CareerAlerts';
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function markup(id, options = {}) {
  if (id === 'linkedin') {
    const modal = `<div role="dialog" ${options.hidden ? 'style="display:none"' : ''}><h2 style="display:none">Post successful</h2><p>Post successful.</p><a href="https://www.linkedin.com/feed/update/urn:li:share:900?actorCompanyId=${options.wrongCompany ? '999' : '74757117'}">View post</a></div>`;
    const card = `<div data-urn="urn:li:activity:901"><div class="update-components-actor"><a href="/company/go-classes/posts"><span class="update-components-actor__name"><span>${options.wrongAuthor ? 'Another company' : 'GO Classes'}</span><span class="visually-hidden">GO Classes</span></span></a></div><div class="update-components-text">💼 IRCON update<br><br>Apply: <a href="https://lnkd.in/short">https://lnkd.in/short</a><br><a><span class="visually-hidden">hashtag</span><span aria-hidden="true">#</span>CareerAlerts</a></div>${options.noImage ? '' : '<img src="/feedshare-photo.png">'}</div>`;
    return '<!doctype html><style>.visually-hidden{display:none}</style><h2 style="display:none">Post successful</h2>' + (options.feed ? card : modal);
  }
  const url = options.changedLink ? 'https://example.com/wrong' : 'https://example.com/apply?course=CS&n=2';
  const card = postId => `<ytd-backstage-post-renderer style="display:block"><a id="author-text" href="/@${options.wrongAuthor ? 'AnotherChannel' : 'GOClassesforGATEDA'}">GO Classes for GATE DA</a><div id="published-time-text"><a href="/post/${postId}">0 seconds ago</a></div><div id="content-text">💼 IRCON ${options.changedCaption ? 'changed' : 'update'}<br><br>Apply: <a href="https://www.youtube.com/redirect?q=${esc(encodeURIComponent(url))}&amp;event=backstage_event">https://example.com/app...</a><br>#CareerAlerts</div>${options.noImage ? '' : '<ytd-backstage-image-renderer><img src="/photo.png"></ytd-backstage-image-renderer>'}</ytd-backstage-post-renderer>`;
  return '<!doctype html>' + card('UgkxNew') + (options.ambiguous ? card('UgkxAnotherNew') : '');
}
const browser = await chromium.launch({ headless: true });
async function fixture(id, options, check) {
  const page = await browser.newPage();
  await page.route('**/*', route => route.request().resourceType() === 'document' ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: markup(id, options) }) : route.abort());
  const expected = id === 'linkedin' ? expectedLi : expectedYt;
  await page.goto(id === 'linkedin' ? expected.companyPageUrl : `https://www.youtube.com/channel/${expected.channelId}/posts`);
  // Any accidental publication click would fail this fixture immediately.
  await page.evaluate(() => { window.postClicks = 0; document.addEventListener('click', event => { if (/^(Post|Send|Share)$/.test(event.target.textContent)) { window.postClicks++; throw Error('No posting during verification'); } }); });
  try { await check(page, expected); assert.equal(await page.evaluate(() => window.postClicks), 0); } finally { await page.close(); }
}
const confirm = (page, id, expected, baseline = []) => confirmPublication({ page, id, expected, caption, baseline, imageCount: 1, timeout: 1600 });
const refuses = (page, id, expected, baseline = []) => assert.rejects(confirmPublication({ page, id, expected, caption, baseline, imageCount: 1, timeout: 100 }), /not confirmed/);
try {
  await fixture('linkedin', {}, async (page, expected) => { const proof = await confirm(page, 'linkedin', expected); assert.equal(proof.verifiedBy, 'native_receipt'); assert.equal(proof.postUrl, 'https://www.linkedin.com/feed/update/urn:li:share:900'); const baseline = await publicationBaseline(page, 'linkedin', expected); await refuses(page, 'linkedin', expected, baseline); });
  for (const options of [{ hidden: true }, { wrongCompany: true }]) await fixture('linkedin', options, (page, expected) => refuses(page, 'linkedin', expected));
  await fixture('linkedin', { feed: true }, async (page, expected) => { assert.equal((await confirm(page, 'linkedin', expected)).verifiedBy, 'new_feed_post'); });
  for (const options of [{ feed: true, wrongAuthor: true }, { feed: true, noImage: true }]) await fixture('linkedin', options, (page, expected) => refuses(page, 'linkedin', expected));
  await fixture('youtubeDA', {}, async (page, expected) => { const proof = await confirm(page, 'youtubeDA', expected); assert.equal(proof.postUrl, 'https://www.youtube.com/post/UgkxNew'); const baseline = await publicationBaseline(page, 'youtubeDA', expected); await refuses(page, 'youtubeDA', expected, baseline); });
  for (const options of [{ wrongAuthor: true }, { changedCaption: true }, { changedLink: true }, { noImage: true }, { ambiguous: true }]) await fixture('youtubeDA', options, (page, expected) => refuses(page, 'youtubeDA', expected));
  console.log('Publication fixtures passed: hidden LinkedIn success heading, visible company receipt, fallback feed proof, shortened LinkedIn links/hashtags, expanded YouTube redirect links, wrong authors, changed captions/URLs, missing media, baseline exclusion and ambiguous posts. No social publication controls were clicked.');
} finally { await browser.close(); }
