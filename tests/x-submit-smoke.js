// Copyright (c) 2026 Mrinal. Offline fixtures only.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { prepareXSubmit } from '../server/automation/x-submit.js';
import { finishPost } from '../server/automation/utils.js';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  await page.setContent(`<style>button{position:absolute;top:100px;left:100px;width:90px;height:45px}.portal{position:fixed;inset:0;pointer-events:none}.empty{position:fixed;inset:0;pointer-events:auto}</style>
    <div role="dialog"><div data-testid="tweetTextarea_0" contenteditable>Reviewed caption</div><button data-testid="tweetButton" onclick="window.sent++">Post</button></div>
    <div class="portal r-aqfbo4 r-12vffkv"><div><div><div class="empty r-1p0dtai r-1d2f490 r-1xcajam r-zchlnj r-ipm5af"></div></div></div></div><script>window.sent=0</script>`);
  const dialog=page.getByRole('dialog'), button=dialog.getByTestId('tweetButton');
  let prepared, submitted=0;
  const ctx={snapshot:async()=>{},step:async()=>{},markSubmitting:async()=>{submitted++;},preflight:async()=>{prepared=await prepareXSubmit(page,dialog,button);},publish:()=>prepared.publish(),verify:async()=>{assert.equal(await page.evaluate(()=>window.sent),1);}};
  assert.equal(await finishPost({...ctx,mode:'TEST'}),'dry_run');
  assert.equal(prepared.method,'keyboard'); assert.equal(submitted,0); assert.equal(await page.evaluate(()=>window.sent),0);
  assert.equal(await finishPost({...ctx,mode:'LIVE',confirmedLive:true}),'posted');
  assert.equal(submitted,1); assert.equal(await page.evaluate(()=>window.sent),1);
  await page.locator('.empty').evaluate(el=>el.setAttribute('role','alertdialog'));
  await assert.rejects(prepareXSubmit(page,dialog,button),/overlay blocking/);
  assert.equal(await page.evaluate(()=>window.sent),1);
  await page.locator('.portal').evaluate(el=>el.remove());
  prepared=await prepareXSubmit(page,dialog,button);
  assert.equal(prepared.method,'pointer');
  console.log('X submit checks passed: empty portal fallback, TEST sends zero, LIVE sends once, unknown modal blocks, normal pointer path.');
} finally { await browser.close(); }
