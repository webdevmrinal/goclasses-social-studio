// Copyright (c) 2026 Mrinal. All rights reserved.
import { manychatBuilderUrl, instagramPostUrl, selectPostCard, replyBatch, DEFAULT_OPENING_DM } from '../../shared/manychat.js';
import { navigate, firstVisible, waitUntilReady, pasteCaption, verifyCaption, preparedButton, finishPost, InterventionError } from './utils.js';

const test = (page, name) => page.locator(`[data-test-id="${name}"]`);
const section = (page, name) => page.getByRole('region').filter({ has: page.getByRole('heading', { name, exact: true }) });

export async function prepareManychat(ctx) {
  const { page, config, caption, mode, step, snapshot } = ctx;
  const options = ctx.manychat || { postUrl: '', links: [], replies: replyBatch(config.platforms.manychat.replyMessages) };
  if (mode === 'LIVE' && !options.postUrl && !ctx.instagramPublication?.candidates?.length) throw new InterventionError('ManyChat needs the verified Instagram post from this run. Publish Instagram first, or stop and start a ManyChat-only run with its exact post URL in Compose.');
  await navigate(page, manychatBuilderUrl(config.platforms.manychat.flowUrl), step);
  const draftPrompt = page.getByText('Continue or start fresh?', { exact: true });
  const entry = await firstVisible([page.getByRole('heading', { name: 'When someone comments on', exact: true }), draftPrompt], 60000);
  if ((await entry.innerText()).trim() === 'Continue or start fresh?') await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('heading', { name: 'When someone comments on', exact: true }).waitFor({ state: 'visible', timeout: 60000 });
  if (await page.getByRole('button', { name: 'Stop', exact: true }).isVisible()) throw new InterventionError('This is an active ManyChat automation. Open the new automation builder before continuing.');
  await test(page, 'ig-media-select-item').first().waitFor({ state: 'visible', timeout: 60000 });
  await page.getByRole('radio', { name: 'a specific post or reel', exact: true }).check();
  await step('Finding the Instagram post for this automation…');
  await page.getByRole('button', { name: 'Show all', exact: true }).click();
  const links = page.getByRole('link', { name: 'View On Instagram', exact: true });
  await links.first().waitFor({ state: 'visible', timeout: 60000 });
  const cards = await links.evaluateAll(els => els.map(el => {
    const card = el.closest('[role="button"],button');
    return { url: el.href, caption: card?.querySelector('img')?.alt || '', image: card?.querySelector('img')?.src || '' };
  }));
  const card = selectPostCard(cards, { postUrl: options.postUrl, publication: ctx.instagramPublication, caption: ctx.instagramCaption, mode });
  if (!card) throw new InterventionError('The intended Instagram post is not available in ManyChat yet, or its caption does not match. Nothing was activated. Wait for ManyChat to refresh and continue; do not select another post.');
  const postUrl = instagramPostUrl(card.url);
  const picked = page.getByRole('button').filter({ has: page.locator(`a[href="${card.url}"]`) });
  if (await picked.count() !== 1) throw new Error('ManyChat returned an ambiguous post selection. Nothing was activated.');
  await picked.click();
  await page.getByRole('heading', { name: 'Pick any post or reel to automate', exact: true }).waitFor({ state: 'hidden' });
  const expectedImage = new URL(card.image).pathname;
  await waitUntilReady(page, () => test(page, 'ig-media-select-item').filter({ has: page.locator('img') }).filter({ visible: true }).evaluateAll((els, path) => els.some(el => el.getAttribute('aria-selected') === 'true' && new URL(el.querySelector('img').src).pathname === path), expectedImage), { message: 'ManyChat did not confirm the selected post.' });
  const postSection = section(page, 'When someone comments on');
  const next = postSection.getByRole('button', { name: 'Next', exact: true });
  if (await next.isVisible()) await next.click();
  await page.getByRole('radio', { name: 'any word', exact: true }).check();
  await page.getByRole('checkbox', { name: 'reply to their comments under the post', exact: true }).check();
  const replies = page.getByRole('textbox', { name: 'Write a reply', exact: true });
  await replies.nth(2).waitFor({ state: 'visible' });
  for (let index = 0; index < 3; index++) { await replies.nth(index).fill(options.replies[index]); await verifyCaption(replies.nth(index), options.replies[index]); }
  await snapshot('comment-replies-prepared');
  const commentNext = section(page, 'And this comment has').getByRole('button', { name: 'Next', exact: true });
  if (await commentNext.isVisible()) await commentNext.click();
  await page.getByRole('checkbox', { name: 'an opening DM', exact: true }).check();
  await page.getByRole('textbox', { name: 'Do a quick vibe check first - are you ready for the link?', exact: true }).fill(DEFAULT_OPENING_DM);
  await test(page, 'optional-opening-dm-button').fill('Send me the link');
  await page.getByRole('checkbox', { name: 'a DM asking to follow you before they get the link', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'a DM asking for their email', exact: true }).uncheck();
  const openingNext = section(page, 'They will get').getByRole('button', { name: 'Next', exact: true });
  if (await openingNext.isVisible()) await openingNext.click();
  const dm = test(page, 'direct-response-multi-links');
  const editor = dm.getByRole('textbox', { name: 'Write a message', exact: true });
  await pasteCaption(page, editor, caption);
  // Continuing a saved inactive draft must not retain links from another post.
  while (await dm.locator('[data-title]').count()) {
    await dm.locator('[data-title]').first().click();
    await page.getByRole('button', { name: 'Delete link', exact: true }).click();
  }
  for (const link of options.links) {
    await dm.getByRole('button', { name: 'Add a link', exact: true }).click();
    await page.getByRole('textbox', { name: 'Button label', exact: true }).fill(link.label);
    await page.getByRole('textbox', { name: 'Link', exact: true }).fill(link.url);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const saved = dm.locator(`[data-title=${JSON.stringify(link.url)}]`);
    await saved.waitFor({ state: 'visible' });
    if ((await saved.innerText()).trim() !== link.label) throw new Error('ManyChat saved a different button label. Nothing was activated.');
  }
  await page.getByRole('checkbox', { name: "a follow up DM if they don't click the link", exact: true }).uncheck();
  await verifyCaption(editor, caption);
  await page.getByRole('tab', { name: 'DM', exact: true }).click();
  const handle = await test(page, 'phone-preview-header').innerText();
  if (handle.trim().toLowerCase() !== config.platforms.instagram.handle.toLowerCase()) throw new InterventionError('ManyChat is connected to a different Instagram account. Check its Instagram connection before continuing.');
  if (!await page.getByRole('radio', { name: 'a specific post or reel', exact: true }).isChecked() || !await page.getByRole('radio', { name: 'any word', exact: true }).isChecked()) throw new Error('ManyChat trigger settings changed during preparation. Nothing was activated.');
  for (let index = 0; index < 3; index++) await verifyCaption(replies.nth(index), options.replies[index]);
  if (await dm.locator('[data-title]').count() !== options.links.length) throw new Error('ManyChat link buttons do not match the reviewed draft. Nothing was activated.');
  for (const link of options.links) {
    if ((await dm.locator(`[data-title=${JSON.stringify(link.url)}]`).innerText()).trim() !== link.label) throw new Error('ManyChat link buttons changed during preparation. Nothing was activated.');
  }
  await ctx.recordPreparation?.({ postUrl, replies: options.replies, links: options.links, testExistingPost: mode !== 'LIVE' && !options.postUrl });
  await step(mode === 'LIVE' ? `Prepared ManyChat for ${postUrl}` : `TEST: prepared an inactive automation for existing post ${postUrl}. No new Instagram post was published.`);
  await snapshot('dm-prepared');
  const goLive = page.getByRole('button', { name: 'Go live', exact: true });
  await preparedButton(page, goLive);
  const result = await finishPost({ ...ctx,
    publish: () => goLive.click(),
    verify: async () => {
      await page.getByRole('button', { name: 'Edit', exact: true }).waitFor({ state: 'visible', timeout: 60000 });
      await page.getByRole('button', { name: 'Stop', exact: true }).waitFor({ state: 'visible', timeout: 60000 });
    }
  });
  const publication = result === 'posted' ? { automationUrl: page.url(), postUrl } : undefined;
  await page.close();
  return { status: result, ...(publication ? { publication } : {}) };
}
