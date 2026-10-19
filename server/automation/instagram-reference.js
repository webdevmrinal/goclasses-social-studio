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
export async function instagramCaptionMatches(page,caption) {
  const more=page.locator('main').getByRole('button',{name:'more',exact:true}).filter({visible:true});
  if(await more.count()===1)await more.click();
  const texts=await page.locator('main h1, main span[dir="auto"], main div[dir="auto"]').allTextContents();
  return texts.some(text=>normalizePostCaption(text)===normalizePostCaption(caption));
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
        if(!exact.length&&fresh.length===1){
          // Profile image alt text often contains a generated description, not
          // the caption. Confirm the fresh permalink's native author and h1.
          await page.goto(fresh[0].url,{waitUntil:'domcontentloaded'});
          await assertNoChallenge(page);
          await page.locator('main').waitFor({state:'visible',timeout:15000});
          if(await instagramCaptionMatches(page,caption))exact.push(fresh[0]);
        }
        return { candidates: fresh.map(post => post.url), ...(exact.length === 1 ? { postUrl: exact[0].url } : {}) };
      }
      await wait(2000);
    }
    return { candidates: [], message: 'The new Instagram post has not appeared in the profile yet.' };
  } catch { return { candidates: [], message: 'Instagram confirmed publication, but its new permalink could not be read.' }; }
  finally { await page.close().catch(() => {}); }
}
