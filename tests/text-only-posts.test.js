// Copyright (c) 2026 Mrinal. Offline driver fixtures; no browser or social requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { PLATFORMS, validateDraft } from '../shared/platforms.js';
import { TEXT_ONLY_PLATFORMS, mediaFor, mediaIdsFor, setTextOnly, updateDraftMedia } from '../shared/media.js';
import { automate } from '../server/automation/platforms.js';
import { confirmPublication } from '../server/automation/publication.js';
import { defaults } from '../server/config.js';

const destinations = ['linkedin', 'x', 'youtubeDA', 'youtubeCS'];
const caption = 'Reviewed text-only update';
const library = [{ id: 'a' }, { id: 'b' }];

test('all text-capable destinations accept captions without photos; Instagram still requires one', () => {
  assert.deepEqual(PLATFORMS.filter(platform => platform.textOnly).map(platform => platform.id), TEXT_ONLY_PLATFORMS);
  for (const id of TEXT_ONLY_PLATFORMS) {
    assert.deepEqual(validateDraft({ selected: [id], captions: { [id]: caption }, mediaIds: ['a', 'b'], mediaByPlatform: { [id]: [] } }, library), []);
    assert.deepEqual(validateDraft({ selected: [id], captions: { [id]: caption }, mediaIds: [] }, []), []);
    assert(validateDraft({ selected: [id], captions: { [id]: '' }, mediaIds: [] }, []).some(error => /add a caption/.test(error)));
  }
  assert(validateDraft({ selected: ['instagram'], captions: { instagram: caption }, mediaIds: ['a'], mediaByPlatform: { instagram: [] } }, library).some(error => /add at least one image/.test(error)));
});

test('explicit photo removal survives library removal, upload and replacement for every text-capable destination', () => {
  for (const id of TEXT_ONLY_PLATFORMS) {
    const draft = { mediaIds: ['a'], mediaByPlatform: { [id]: [] }, textOnlyPlatforms: [] };
    setTextOnly(draft, id, true);
    for (const ids of [[], ['b'], ['a', 'b']]) {
      updateDraftMedia(draft, ids, { a: 'b' });
      assert.deepEqual(mediaFor(draft, library, id), [], id);
      assert.deepEqual(mediaIdsFor(draft, id), [], id);
      assert(draft.textOnlyPlatforms.includes(id));
    }
    delete draft.mediaByPlatform[id];
    setTextOnly(draft, id, false);
    assert.deepEqual(mediaFor(draft, library, id), id === 'whatsapp' ? library.slice(0, 1) : library);
    const depleted = { mediaIds: ['a'], mediaByPlatform: { [id]: ['a'] } };
    updateDraftMedia(depleted, []);
    assert(!Object.hasOwn(depleted.mediaByPlatform, id));
  }
  const draft = { textOnlyPlatforms: ['instagram', 'unknown'], mediaByPlatform: {} };
  setTextOnly(draft, 'instagram', true);
  updateDraftMedia(draft, []);
  assert.deepEqual(draft.textOnlyPlatforms, []);
});

// These locators implement only operations used by the adapters. Upload controls
// fail if touched for an empty selection, and final clicks are recorded locally.
class Locator {
  constructor(page, kind) { this.page = page; this.kind = kind; }
  first() { return this; }
  last() { return this; }
  filter() { return this; }
  locator(selector) { return this.page.locate(selector); }
  getByRole(role, options) { return this.page.role(role, options, this.kind); }
  getByText(text) { return this.page.text(text); }
  getByTestId(id) { return this.page.testId(id); }
  async isVisible() { return !['missing', 'challenge', 'cookie'].includes(this.kind); }
  async isEnabled() { return true; }
  async count() { return this.kind === 'missing' ? 0 : 1; }
  async waitFor() { assert(await this.isVisible(), `Missing fixture control: ${this.kind}`); }
  async getAttribute(name) {
    if (this.kind === 'profile' && name === 'href') return '/our_account';
    if (this.kind === 'upload' && name === 'multiple') return '';
    return null;
  }
  async textContent() {
    if (this.kind === 'accountName') return this.page.expected.channelName;
    if (this.kind === 'accountHandle') return '@' + this.page.expected.handle;
    return this.kind === 'entry' ? 'Start a post' : '';
  }
  async innerText() { return this.textContent(); }
  async click(options = {}) {
    if (this.kind === 'addMedia') {
      assert(this.page.files.length, 'An empty selection must never open media controls');
      this.page.actions.push('open-media');
    } else if (this.kind === 'post') {
      if (options.trial) this.page.actions.push('trial-post');
      else { this.page.actions.push('publish'); this.page.published = true; }
    }
  }
  async fill(value) { this.page.editor = value; }
  async press() {}
  async scrollIntoViewIfNeeded() {}
  async setInputFiles(files) {
    assert(files.length, 'An empty selection must never upload');
    this.page.uploaded = files.length;
    this.page.actions.push('upload');
  }
  async evaluate(fn, argument) { return fn({ value: this.page.editor }, argument); }
  async evaluateAll(fn, argument) {
    let elements = [];
    if (this.kind === 'allFiles') elements = [{ files: Array(this.page.restoredFiles || this.page.uploaded).fill({}) }];
    if (['previews', 'images', 'attachments'].includes(this.kind)) elements = Array(this.page.restoredPreview || this.page.uploaded).fill(null).map(() => ({ getClientRects: () => [1], complete: true, naturalWidth: 50 }));
    const evaluate = vm.runInNewContext('(' + fn.toString() + ')', { getComputedStyle: () => ({ visibility: 'visible' }) });
    return evaluate(elements, argument);
  }
}

function driver(id, files, options = {}) {
  const config = structuredClone(defaults);
  config.platforms.x.handle = 'our_account';
  config.platforms.youtubeDA.channelId = 'UCkOaW747107QQNo-o0yhJGg';
  config.platforms.youtubeCS.channelId = 'UCe123456789012345678901';
  const page = {
    id, files, expected: config.platforms[id], actions: [], editor: '', uploaded: 0, restoredPreview: 0, restoredFiles: 0, published: false, ...options,
    url: () => page.currentUrl,
    goto: async url => { page.currentUrl = url; return { status: () => 200 }; },
    isClosed: () => false,
    close: async () => {},
    keyboard: { press: async () => {} },
    context: () => ({ grantPermissions: async () => { throw Error('Fixture uses the Unicode fill fallback'); } }),
    getByRole: (role, options) => page.role(role, options),
    getByText: text => page.text(text),
    getByTestId: id => page.testId(id),
    locator: selector => page.locate(selector),
    text: text => new Locator(page, text === page.expected.companyName || text === page.expected.channelName ? 'identity' : 'missing'),
    role: (role, { name } = {}, scope) => {
      if (role === 'dialog') return new Locator(page, name === 'Editor' ? 'mediaDialog' : 'composer');
      if (role === 'textbox') return new Locator(page, 'editor');
      if (role === 'img') return new Locator(page, 'images');
      if (role === 'button' && /optional cookies|essential cookies/i.test(String(name))) return new Locator(page, 'cookie');
      if (role === 'button' && name === 'Post') return new Locator(page, 'post');
      if (role === 'button' && /add an image|add media/i.test(String(name))) return new Locator(page, 'addMedia');
      if (role === 'button' && name === 'Next') return new Locator(page, 'next');
      return new Locator(page, scope ? 'missing' : 'entry');
    },
    testId: id => new Locator(page, ({ AppTabBar_Profile_Link: 'profile', tweetTextarea_0: 'editor', tweetButton: 'post', attachments: 'attachments' })[id] || 'missing'),
    locate: selector => {
      if (selector.includes('iframe[')) return new Locator(page, 'challenge');
      if (selector === '#avatar-btn') return new Locator(page, 'accountButton');
      if (/multi-page-menu-renderer/.test(selector)) return new Locator(page, 'menu');
      if (selector === '#account-name') return new Locator(page, 'accountName');
      if (selector === '#channel-handle') return new Locator(page, 'accountHandle');
      if (selector === 'input[type="file"]') return new Locator(page, 'allFiles');
      if (selector.includes('input[type="file"]')) return new Locator(page, 'upload');
      if (selector.includes('img') || selector.includes('ytd-backstage-image-renderer')) return new Locator(page, 'previews');
      if (selector.includes('#contenteditable-root')) return new Locator(page, 'editor');
      if (selector === 'ytd-backstage-post-dialog-renderer') return new Locator(page, 'composer');
      if (selector === 'ytd-backstage-multi-image-select-renderer') return new Locator(page, 'media');
      return new Locator(page, 'missing');
    },
    waitForEvent: async event => {
      assert.equal(event, 'filechooser');
      assert(files.length, 'An empty selection must never request a file chooser');
      return { isMultiple: () => true, setFiles: files => page.locate('input[type="file"][multiple]').setInputFiles(files) };
    },
    evaluate: async (fn, argument) => {
      if (!argument) return { id: page.expected.channelId, name: page.expected.channelName, handle: page.expected.handle };
      assert(argument.id, 'Unexpected page evaluation in the fixture');
      return { receipts: [], records: page.published ? [{ url: id === 'linkedin' ? 'https://www.linkedin.com/feed/update/urn:li:share:901' : 'https://www.youtube.com/post/UgkxTextOnly', authorMatches: true, text: caption, images: page.uploaded }] : [] };
    }
  };
  const ctx = { page, id, config, files, caption, mode: 'TEST', step: async () => {}, snapshot: async label => page.actions.push(label), markSubmitting: async () => page.actions.push('persist') };
  return { page, ctx };
}

for (const id of destinations) {
  test(`${id}: no-photo TEST prepares the caption without touching media or publishing`, async () => {
    const { page, ctx } = driver(id, []);
    assert.equal(await automate(ctx), 'dry_run');
    assert.equal(page.editor, caption);
    assert(page.actions.includes('account-verified'));
    assert(page.actions.includes('ready-to-publish'));
    assert(!page.actions.some(action => ['upload', 'open-media', 'images-uploaded', 'publish', 'persist'].includes(action)));
  });
  for (const stale of [{ restoredPreview: 1 }, { restoredFiles: 1 }]) {
    test(`${id}: leftover ${stale.restoredPreview ? 'preview' : 'file selection'} blocks a no-photo post before submission`, async () => {
      const { page, ctx } = driver(id, [], stale);
      await assert.rejects(automate({ ...ctx, mode: 'LIVE', confirmedLive: true }), /text-only composer still has attached media/);
      assert(!page.actions.includes('persist'));
      assert(!page.actions.includes('publish'));
    });
  }
  test(`${id}: no-photo LIVE still requires the existing explicit run confirmation`, async () => {
    const { page, ctx } = driver(id, []);
    await assert.rejects(automate({ ...ctx, mode: 'LIVE' }), /explicit confirmation/);
    assert(!page.actions.includes('persist'));
    assert(!page.actions.includes('publish'));
  });
  test(`${id}: a restored attachment after review is rechecked before publication`, async () => {
    const { page, ctx } = driver(id, []);
    const snapshot = async label => { if (label === 'ready-to-publish') page.restoredPreview = 1; };
    await assert.rejects(automate({ ...ctx, mode: 'LIVE', confirmedLive: true, snapshot }), /text-only composer still has attached media/);
    assert(!page.actions.includes('persist'));
    assert(!page.actions.includes('publish'));
  });
  test(`${id}: selecting a photo keeps the existing upload preparation`, async () => {
    const { page, ctx } = driver(id, ['local-fixture.png']);
    assert.equal(await automate(ctx), 'dry_run');
    assert(page.actions.includes('upload'));
    assert(page.actions.includes('images-uploaded'));
    assert(!page.actions.includes('publish'));
  });
}

for (const id of ['linkedin', 'youtubeDA', 'youtubeCS']) {
  test(`${id}: native publication confirmation accepts a matching text-only feed record`, async () => {
    const { page, ctx } = driver(id, []);
    await page.goto(id === 'linkedin' ? ctx.config.platforms[id].companyPageUrl : `https://www.youtube.com/channel/${page.expected.channelId}/posts`);
    page.published = true;
    assert.equal((await confirmPublication({ page, id, expected: page.expected, caption, baseline: [], imageCount: 0, timeout: 1500 })).verifiedBy, 'new_feed_post');
    await assert.rejects(confirmPublication({ page, id, expected: page.expected, caption: 'Different caption', baseline: [], imageCount: 0, timeout: 1 }), /not confirmed/);
    await assert.rejects(confirmPublication({ page, id, expected: page.expected, caption, baseline: [], imageCount: 1, timeout: 1 }), /not confirmed/);
  });
}
