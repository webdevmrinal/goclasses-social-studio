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
  const draft = Object.hasOwn(options, 'draft') ? `<ytd-backstage-post-dialog-renderer style="display:block"><div contenteditable="true">${esc(options.draft)}</div></ytd-backstage-post-dialog-renderer>` : options.commentDraft ? '<div contenteditable="true">Unsent comment draft</div>' : '';
  return '<!doctype html>' + card(options.postId || 'UgkxNew') + (options.ambiguous ? card('UgkxAnotherNew') : '') + draft;
}
const browser = await chromium.launch({ headless: true });
async function fixture(id, options, check) {
  const context=await browser.newContext(),page=await context.newPage(); let loads=0;
  await page.context().route('**/*', route => {
    if (route.request().resourceType() !== 'document') return route.abort();
    loads++;
    if (options.failRefresh && loads > 1) return route.abort();
    const shown = options.staleUntilRefresh && loads === 1 ? { ...options, postId: 'UgkxOld', changedCaption: true } : options;
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: markup(id, shown) });
  });
  const expected = id === 'linkedin' ? expectedLi : expectedYt;
  // This guard is installed on every navigation, including a read-only refresh.
  await page.context().addInitScript(() => { window.postClicks = 0; document.addEventListener('click', event => { if (/^(Post|Send|Share)$/.test(event.target.textContent)) { window.postClicks++; throw Error('No posting during verification'); } }); });
  await page.goto(id === 'linkedin' ? expected.companyPageUrl : `https://www.youtube.com/channel/${options.wrongChannel ? 'UCWrongChannel' : expected.channelId}/posts`);
  try { await check(page, expected, () => loads); if (!options.failRefresh) assert.equal(await page.evaluate(() => window.postClicks), 0); } finally { await context.close(); }
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
  await fixture('youtubeDA', { staleUntilRefresh: true }, async (page, expected, loads) => {
    const proof = await confirmPublication({ page, id: 'youtubeDA', expected, caption, baseline: ['https://www.youtube.com/post/UgkxOld'], imageCount: 1, timeout: 2200 });
    assert.equal(proof.postUrl, 'https://www.youtube.com/post/UgkxNew'); assert.equal(loads(), 2, 'One stale-feed refresh discovers the accepted post');
    assert.equal(page.url(), `https://www.youtube.com/channel/${expected.channelId}/posts`);
  });
  await fixture('youtubeDA', { staleUntilRefresh: true }, async (page, expected, loads) => {
    await assert.rejects(confirmPublication({ page, id: 'youtubeDA', expected, caption, baseline: ['https://www.youtube.com/post/UgkxNew'], imageCount: 1, timeout: 1300 }), /not confirmed/);
    assert.equal(loads(), 2, 'The original baseline survives the single refresh');
  });
  for (const options of [{ staleUntilRefresh: true, wrongAuthor: true }, { staleUntilRefresh: true, noImage: true }]) await fixture('youtubeDA', options, async (page, expected, loads) => {
    await assert.rejects(confirmPublication({ page, id: 'youtubeDA', expected, caption, baseline: [], imageCount: 1, timeout: 1300 }), /not confirmed/); assert.equal(loads(), 2);
  });
  await fixture('youtubeDA', { ambiguous: true }, async (page, expected, loads) => {
    await assert.rejects(confirmPublication({ page, id: 'youtubeDA', expected, caption, baseline: [], imageCount: 1, timeout: 1000 }), /not confirmed/); assert.equal(loads(), 1, 'Ambiguous matching candidates must not trigger refresh');
  });
  for (const pending of [{ draft: 'Human unsent draft' }, { draft: '' }, { commentDraft: true }]) await fixture('youtubeDA', { staleUntilRefresh: true, ...pending }, async (page, expected, loads) => {
    const proof=await confirmPublication({page,id:'youtubeDA',expected,caption,baseline:[],imageCount:1,timeout:2200});assert.equal(proof.postUrl,'https://www.youtube.com/post/UgkxNew');
    assert.equal(loads(),2);assert.equal(page.context().pages().length,1,'The owned observation tab was closed; original draft preserved'); assert.equal(await page.locator('[contenteditable="true"]').textContent(), Object.hasOwn(pending, 'draft') ? pending.draft : 'Unsent comment draft');
  });
  await fixture('youtubeDA', { wrongChannel: true }, async (page, expected, loads) => {
    await assert.rejects(confirmPublication({ page, id: 'youtubeDA', expected, caption, baseline: [], imageCount: 1, timeout: 1000 }), /configured YouTube channel/); assert.equal(loads(), 1, 'Wrong-channel evidence must fail before navigation');
  });
  await fixture('youtubeDA', { staleUntilRefresh: true, failRefresh: true }, async (page, expected, loads) => {
    await assert.rejects(confirmPublication({ page, id: 'youtubeDA', expected, caption, baseline: [], imageCount: 1, timeout: 1600 }), /publication may have occurred.*read-only feed refresh did not complete/); assert.equal(loads(), 2);
  });
  console.log('Publication fixtures passed: LinkedIn receipts and feed proof; exact YouTube authors, captions, links and media; one guarded stale-feed refresh; preserved baseline, ambiguous posts and pending drafts; wrong-channel refusal and uncertain refresh failure. No social publication controls were clicked.');
} finally { await browser.close(); }
