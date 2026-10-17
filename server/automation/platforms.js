// Copyright (c) 2026 Mrinal. All rights reserved.
import { navigate, firstVisible, clickAny, dismissCookies, assertNoChallenge, pasteCaption, verifyCaption, waitForImages, preparedButton, uploadImages, finishPost, InterventionError, AccountMismatchError, ReadinessError, NetworkError, waitUntilReady } from './utils.js';
import { setupErrors } from '../config.js';
import { prepareManychat } from './manychat.js';
import { instagramBaseline, instagramPublication } from './instagram-reference.js';
import { checkWhatsAppLogin, prepareWhatsApp } from './whatsapp.js';

export function destinationUrl(id, config) {
  const p = config.platforms[id];
  if (id === 'instagram') return 'https://www.instagram.com/';
  if (id === 'linkedin') return p.companyPageUrl;
  if (id === 'x') return 'https://x.com/home';
  if (id === 'whatsapp') return 'https://web.whatsapp.com/';
  if (id.startsWith('youtube')) return p.channelId ? `https://www.youtube.com/channel/${p.channelId}/posts` : `https://www.youtube.com/@${p.handle}`;
  return p.flowUrl || 'https://manychat.com/';
}

export async function readXAccount(page, timeout = 60000) {
  return waitUntilReady(page, async () => {
    const profile = page.getByTestId('AppTabBar_Profile_Link');
    if (await profile.isVisible().catch(() => false)) {
      const href = await profile.getAttribute('href');
      const match = href && new URL(href, page.url()).pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
      if (match) return match[1];
    }
    const account = page.getByTestId('SideNav_AccountSwitcher_Button');
    if (await account.isVisible().catch(() => false)) return (await account.textContent())?.match(/@([A-Za-z0-9_]{1,15})\b/)?.[1];
  }, { timeout, message: 'X has not finished loading its account controls after 60 seconds. Your session may still be signed in; leave the worker tab open and try Open & check again.' });
}
export async function readYouTubeChannel(page, expected, timeout = 60000) {
  const metadata = await waitUntilReady(page, () => page.evaluate(() => {
    const data = window.ytInitialData?.metadata?.channelMetadataRenderer;
    if (!data?.externalId || !data.title) return null;
    const vanity = data.vanityChannelUrl || data.ownerUrls?.find(url => /\/@/.test(url));
    return vanity ? { id: data.externalId, name: data.title, handle: new URL(vanity).pathname.replace(/^\/@/, '').replace(/\/$/, '') } : null;
  }), { timeout, message: 'YouTube is still loading channel information. Leave the worker tab open and try Open & check again.' });
  if (!/^UC[\w-]{22}$/.test(metadata.id) || metadata.handle.toLowerCase() !== expected.handle.toLowerCase() || metadata.name !== expected.channelName || expected.channelId && metadata.id !== expected.channelId) throw new AccountMismatchError('The loaded YouTube channel does not match the configured name, handle, and channel ID. Check Connections before continuing.');
  return metadata;
}

async function verifyIdentity(page, id, config, maySwitch = true, step = async () => {}) {
  await assertNoChallenge(page);
  const p = config.platforms[id];
  if (id === 'instagram') {
    const link = await firstVisible([
      page.getByRole('link', { name: /(?:^|\s)profile$/i }),
      page.locator('a').filter({ has: page.locator('img[alt$="profile picture"]') }).filter({ hasText: /^Profile$/i })
    ], 15000);
    const href = await link.getAttribute('href');
    const handle = href ? new URL(href, page.url()).pathname.replace(/^\/|\/$/g, '') : '';
    if (!/^[\w.]+$/.test(handle)) throw new Error('The Instagram profile link could not be read.');
    if (handle.toLowerCase() !== p.handle.toLowerCase()) throw new AccountMismatchError(`Instagram is signed in as @${handle}; Connections expects @${p.handle}. Update the expected handle or switch accounts, then continue.`);
  } else if (id === 'x') {
    await step('Waiting for X account controls to finish loading…');
    const handle = await readXAccount(page);
    if (handle.toLowerCase() !== p.handle.toLowerCase()) throw new AccountMismatchError(`X is signed in as @${handle}; Connections expects @${p.handle}. Update the expected handle or switch accounts.`);
  } else if (id === 'linkedin') {
    const expectedPath = new URL(p.companyPageUrl).pathname.replace(/\/$/, '');
    if (!new URL(page.url()).pathname.startsWith(expectedPath)) throw new InterventionError('LinkedIn did not open the configured company admin page. Check your page-manager access.');
    await page.getByText(p.companyName, { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 });
  } else if (id.startsWith('youtube')) {
    // Verify the active account menu, never just a public channel heading.
    await step(`Waiting for YouTube · ${p.channelName}…`);
    await clickAny([page.locator('#avatar-btn'), page.getByRole('button', { name: /account menu|account photo|profile picture/i })], 60000);
    const menu = await firstVisible([page.locator('ytd-multi-page-menu-renderer'), page.locator('yt-multi-page-menu-renderer')], 60000);
    const { name, handle } = await waitUntilReady(page, async () => {
      const name = (await menu.locator('#account-name').textContent({ timeout: 1000 }))?.trim();
      const handle = (await menu.locator('#channel-handle').textContent({ timeout: 1000 }))?.trim().replace(/^@/, '');
      return name && handle ? { name, handle } : null;
    }, { message: 'YouTube’s account menu has not finished loading. Try Open & check again.' });
    if (name !== p.channelName || handle.toLowerCase() !== p.handle.toLowerCase()) {
      if (maySwitch) {
        try {
          await step(`Switching YouTube to ${p.channelName}…`);
          await menu.getByText('Switch account', { exact: true }).click();
          // Match both exact identity fields inside the account's option.
          const account = page.getByRole('option').filter({ has: page.getByText(p.channelName, { exact: true }) }).filter({ has: page.getByText(`@${p.handle}`, { exact: true }) });
          await account.first().waitFor({ state: 'visible', timeout: 60000 });
          if (await account.count() !== 1) throw new Error('Ambiguous channel name');
          const navigation = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame(), timeout: 30000 }).then(() => true).catch(() => false);
          const notice = page.getByRole('dialog').filter({ hasText: 'Your private activity, such as searching and watching videos would be attributed to your personal account' }).getByRole('button', { name: 'Got it', exact: true });
          const noticeReady = notice.waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false);
          await account.getByText(p.channelName, { exact: true }).click();
          await Promise.race([navigation, noticeReady]);
          if (await notice.isVisible().catch(() => false)) await notice.click();
          if (!await navigation) throw new Error('YouTube did not finish switching accounts within 30 seconds.');
          await page.waitForLoadState('domcontentloaded');
          // Switching is not proof of identity. Re-open the menu and verify both fields.
          await verifyIdentity(page, id, config, false, step);
          return;
        } catch (error) {
          await page.keyboard.press('Escape').catch(() => {});
          if (error instanceof InterventionError) throw error;
          throw new InterventionError(`Switch to "${p.channelName}" (@${p.handle}) in YouTube's account menu, then continue. The automatic account switch could not be verified. ${error.message.split('\n')[0]}`);
        }
      }
      await page.keyboard.press('Escape');
      throw new AccountMismatchError(`Active YouTube account is "${name}" (@${handle}). Switch to "${p.channelName}" (@${p.handle}) using YouTube's account menu, then continue.`);
    }
    await page.keyboard.press('Escape');
  } else {
    if (!page.url().includes('manychat.com')) throw new InterventionError('Sign in to ManyChat in the worker browser.');
    await firstVisible([page.getByRole('link', { name: /automation/i }), page.getByText('Automation', { exact: true })], 15000);
  }
}

export async function checkLogin({ page, id, config, step, requireEmpty }) {
  if (id === 'whatsapp') return checkWhatsAppLogin({ page, config, step, requireEmpty });
  let discoveredId, discoveredHandle, detectedSettings;
  const resolved = structuredClone(config);
  try {
    if (id.startsWith('youtube') && (!resolved.platforms[id].handle || !resolved.platforms[id].channelName)) return { status: 'needs_setup', message: 'Add the YouTube channel name and handle in Connections. The channel ID will be detected automatically.' };
    await navigate(page, destinationUrl(id, resolved), step);
    await dismissCookies(page);
    if (id.startsWith('youtube')) {
      await step('Detecting the YouTube channel ID...');
      const metadata = await readYouTubeChannel(page, resolved.platforms[id]);
      discoveredId = metadata.id;
      if (!resolved.platforms[id].channelId) {
        resolved.platforms[id].channelId = discoveredId;
        detectedSettings = { channelId: discoveredId };
      }
    } else if (id === 'x') {
      await step('Waiting for X account controls to finish loading...');
      discoveredHandle = await readXAccount(page);
      if (!resolved.platforms.x.handle) {
        resolved.platforms.x.handle = discoveredHandle;
        detectedSettings = { handle: discoveredHandle };
      }
    }
    const missingSetup = setupErrors(resolved, [id]);
    if (missingSetup.length) return { status: 'needs_setup', message: missingSetup.join(' '), discoveredId, discoveredHandle, detectedSettings };
    await verifyIdentity(page, id, resolved, true, step);
    return { status: 'verified', message: id.startsWith('youtube') ? 'Channel identity verified. The worker switches to this channel automatically before its post.' : 'Account identity verified', discoveredId, discoveredHandle, detectedSettings };
  } catch (error) {
    const status = error instanceof AccountMismatchError ? 'wrong_account' : error instanceof ReadinessError ? 'loading_timeout' : error instanceof NetworkError ? 'network_error' : error instanceof InterventionError ? 'needs_login' : 'verification_failed';
    return { status, message: error instanceof InterventionError || error instanceof NetworkError ? error.message.replace(/then (?:choose )?continue\./gi, 'then click Open & check again.') : 'The account could not be verified. Check the expected account in Connections and the worker browser, then click Open & check again. This does not necessarily mean you are signed out.', discoveredId, discoveredHandle, detectedSettings };
  }
}

export async function automate(ctx) {
  if (ctx.id === 'whatsapp') return prepareWhatsApp(ctx);
  const { page, id, config, step, snapshot } = ctx;
  const url = id.startsWith('youtube') ? `https://www.youtube.com/channel/${config.platforms[id].channelId}/posts` : destinationUrl(id, config);
  await navigate(page, url, step);
  await dismissCookies(page);
  await verifyIdentity(page, id, config, true, step);
  if (id.startsWith('youtube')) {
    // Account switching can navigate away. Return to the configured channel and
    // verify its public ID independently of the signed-in account menu.
    if (!page.url().includes(`/channel/${config.platforms[id].channelId}/posts`)) await navigate(page, url, step);
    await readYouTubeChannel(page, config.platforms[id]);
  }
  await snapshot('account-verified');
  if (id === 'manychat') return prepareManychat(ctx);
  if (id === 'instagram') return instagram(ctx);
  if (id === 'linkedin') return linkedin(ctx);
  if (id === 'x') return x(ctx);
  return youtube(ctx);
}

async function instagram(ctx) {
  const { page, files, caption, step, snapshot } = ctx;
  let baseline;
  if (ctx.mode === 'LIVE' && ctx.captureInstagramPost) {
    await step('Reading existing Instagram post IDs for the ManyChat connection…');
    baseline = await instagramBaseline(page.context(), ctx.config.platforms.instagram.handle);
    await page.bringToFront();
  }
  await step('Opening the Instagram composer…');
  await clickAny([page.getByRole('link', { name: /^create$/i }), page.getByRole('button', { name: /^create$/i }), page.locator('svg[aria-label="New post"]').locator('..')]);
  const entry = await firstVisible([page.getByRole('button', { name: 'Select from computer', exact: true }), page.getByRole('menuitem', { name: /^post$/i }), page.getByText('Post', { exact: true })]);
  if (await entry.textContent() !== 'Select from computer') await entry.click();
  await uploadImages(page, files, step, { trigger: page.getByRole('button', { name: 'Select from computer', exact: true }) });
  await page.getByRole('button', { name: /^next$/i }).waitFor({ state: 'visible', timeout: 60000 });
  await snapshot('images-uploaded');
  for (let i = 0; i < 2; i++) await clickAny([page.getByRole('button', { name: /^next$/i }), page.getByRole('link', { name: /^next$/i })]);
  await step('Adding the caption…');
  const composer = page.getByRole('dialog').filter({ visible: true }).last();
  const editor = await firstVisible([composer.getByRole('textbox', { name: /(?:write|add) a caption/i }), composer.locator('[contenteditable="true"][role="textbox"]'), composer.locator('textarea[aria-label*="caption"]')]);
  await pasteCaption(page, editor, caption);
  await verifyCaption(editor, caption);
  const share = composer.getByRole('button', { name: /^share$/i });
  await preparedButton(page, share);
  const result = await finishPost({ ...ctx,
    preflight: () => verifyCaption(editor, caption),
    publish: () => share.click(),
    verify: () => page.getByText(/your post has been shared/i).waitFor({ timeout: 30000 })
  });
  let publication;
  if (result === 'posted' && baseline) {
    await step('Finding the published Instagram post for ManyChat…');
    publication = await instagramPublication(page.context(), ctx.config.platforms.instagram.handle, baseline, caption);
  }
  await page.close();
  return publication ? { status: result, publication } : result;
}

async function linkedin(ctx) {
  const { page, files, caption, config, step, snapshot } = ctx;
  await step('Opening the company composer…');
  const entry = await firstVisible([page.getByRole('button', { name: /start a post|create a post/i }), page.getByRole('link', { name: /^create$/i }), page.getByRole('button', { name: /^create$/i })]);
  const createMenu = (await entry.innerText()).trim() === 'Create';
  await entry.click();
  if (createMenu) await page.getByRole('dialog', { name: 'Create', exact: true }).getByRole('link', { name: /^start a post/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Create post modal', exact: true });
  await dialog.waitFor({ state: 'visible', timeout: 30000 });
  // Require an exact company identity inside the composer before any content is inserted.
  await dialog.getByText(config.platforms.linkedin.companyName, { exact: true }).first().waitFor({ state: 'visible' });
  const addMedia = dialog.getByRole('button', { name: /add media|add a photo|add photos|add an image/i });
  await uploadImages(page, files, step, { trigger: addMedia });
  const mediaDialog = page.getByRole('dialog', { name: 'Editor', exact: true });
  await waitForImages(page, mediaDialog.getByRole('img', { name: /^Preview of / }));
  if (files.length > 1) await waitForImages(page, mediaDialog.locator('img:not([alt^="Preview of "])'), files.length);
  await mediaDialog.getByRole('button', { name: 'Next', exact: true }).click();
  if (files.length === 1) await waitForImages(page, dialog.getByRole('img', { name: 'Image preview', exact: true }));
  else await waitForImages(page, dialog.locator('img[src^="data:image"],img[src^="blob:"]'), files.length);
  await snapshot('images-uploaded');
  await step('Adding the caption…');
  const editor = dialog.getByRole('textbox', { name: 'Text editor for creating content', exact: true });
  await pasteCaption(page, editor, caption);
  await verifyCaption(editor, caption);
  const post = dialog.getByRole('button', { name: 'Post', exact: true });
  await preparedButton(page, post);
  const result = await finishPost({ ...ctx,
    preflight: () => verifyCaption(editor, caption),
    publish: () => post.click(),
    verify: () => page.getByText(/post successful|your post was successfully|post published/i).first().waitFor({ timeout: 30000 })
  });
  await page.close();
  return result;
}

async function x(ctx) {
  const { page, files, caption, step, snapshot } = ctx;
  await navigate(page, 'https://x.com/compose/post', step);
  await assertNoChallenge(page);
  const dialog = page.getByRole('dialog').filter({ has: page.getByTestId('tweetTextarea_0') }).last();
  await dialog.waitFor({ state: 'visible', timeout: 60000 });
  await uploadImages(page, files, step, { input: dialog.locator('input[type="file"][accept*="image"]') });
  await waitForImages(page, dialog.getByTestId('attachments').locator('img'), files.length);
  await snapshot('images-uploaded');
  await step('Adding the caption…');
  const editor = dialog.getByTestId('tweetTextarea_0');
  await pasteCaption(page, editor, caption);
  await verifyCaption(editor, caption);
  const post = dialog.getByTestId('tweetButton');
  await preparedButton(page, post);
  const result = await finishPost({ ...ctx,
    preflight: async () => { await verifyCaption(editor, caption); await waitForImages(page, dialog.getByTestId('attachments').locator('img'), files.length); },
    publish: () => post.click(),
    verify: () => page.getByText(/your post was sent/i).waitFor({ timeout: 30000 })
  });
  await page.close();
  return result;
}

async function youtube(ctx) {
  const { page, files, caption, step, snapshot } = ctx;
  await step('Opening the community composer…');
  const entry = await firstVisible([page.locator('ytd-backstage-post-dialog-renderer #contenteditable-root[contenteditable="true"]').filter({ visible: true }), page.getByText('Post an update to your fans', { exact: false }), page.getByRole('button', { name: /^create a post$|^create post$/i }), page.locator('#placeholder-area')]);
  await entry.click();
  const composer = page.locator('ytd-backstage-post-dialog-renderer').filter({ has: page.locator('#contenteditable-root[contenteditable="true"]').filter({ visible: true }) });
  await composer.getByText(ctx.config.platforms[ctx.id].channelName, { exact: true }).first().waitFor({ state: 'visible' });
  await composer.getByRole('button', { name: 'Add an image', exact: true }).click();
  const media = composer.locator('ytd-backstage-multi-image-select-renderer');
  await uploadImages(page, files, step, { input: media.locator('input[type="file"][multiple]') });
  await waitForImages(page, media.locator('img'), files.length);
  await snapshot('images-uploaded', composer);
  await step('Adding the caption…');
  const editor = composer.locator('#contenteditable-root[contenteditable="true"]').filter({ visible: true });
  await pasteCaption(page, editor, caption);
  await verifyCaption(editor, caption);
  const post = composer.getByRole('button', { name: 'Post', exact: true });
  await preparedButton(page, post);
  const result = await finishPost({ ...ctx,
    preflight: () => verifyCaption(editor, caption),
    snapshot: label => snapshot(label, composer),
    publish: () => post.click(),
    verify: () => page.getByText(/post published|your post has been published/i).first().waitFor({ timeout: 30000 })
  });
  await page.close();
  return result;
}
