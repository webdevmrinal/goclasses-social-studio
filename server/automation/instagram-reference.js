// Copyright (c) 2026 Mrinal. All rights reserved.
import { instagramPostUrl, normalizePostCaption } from '../../shared/manychat.js';
import { assertNoChallenge, wait } from './utils.js';

async function profilePosts(page, handle) {
  await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: 'domcontentloaded' });
  await assertNoChallenge(page);
  await page.locator('a[href*="/p/"],a[href*="/reel/"]').first().waitFor({ state: 'visible', timeout: 30000 });
  const posts = await page.locator('a[href*="/p/"],a[href*="/reel/"]').evaluateAll(els => els.map(el => ({ url: el.href, caption: el.querySelector('img')?.alt || '' })));
  return posts.map(post => ({ ...post, url: instagramPostUrl(post.url) })).filter(post => post.url);
}
export async function instagramBaseline(context, handle) {
  const page = await context.newPage();
  try { return (await profilePosts(page, handle)).map(post => post.url); }
  finally { await page.close(); }
}
export async function instagramPublication(context, handle, baseline, caption) {
  const page = await context.newPage();
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const posts = await profilePosts(page, handle);
      const fresh = posts.filter(post => !baseline.includes(post.url));
      if (fresh.length) {
        const exact = fresh.filter(post => normalizePostCaption(post.caption) === normalizePostCaption(caption));
        return { candidates: fresh.map(post => post.url), ...(exact.length === 1 ? { postUrl: exact[0].url } : {}) };
      }
      await wait(2000);
    }
    return { candidates: [], message: 'The new Instagram post has not appeared in the profile yet.' };
  } catch { return { candidates: [], message: 'Instagram confirmed publication, but its new permalink could not be read.' }; }
  finally { await page.close().catch(() => {}); }
}
