// Copyright (c) 2026 Mrinal. Isolated connection/UI checks; no social website is opened.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { createApp } from '../server/index.js';
import { defaults } from '../server/config.js';
import { PLATFORMS } from '../shared/platforms.js';
const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-connections-')),checks=[],errors=[],external=[];
const {app}=await createApp({dataDir,browser:{page:async()=>({isClosed:()=>true})},queueOptions:{runner:async()=>{throw Error('No run allowed');},loginChecker:async ctx=>{checks.push(ctx.id);return {status:'verified',message:'Offline fixture verified'};}}});
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await page.addInitScript(()=>localStorage.setItem('mrinal.social-studio.draft',JSON.stringify({selected:['x'],captions:{x:'Existing draft'},mediaIds:[]})));
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('request',r=>{if(!r.url().startsWith(origin))external.push(r.url())});
async function contrast() {
 return page.locator('.mode-switch button').evaluateAll(buttons=>{
  const lum=c=>{const rgb=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]};
  return buttons.map(el=>{const style=getComputedStyle(el);let parent=el,bg=style.backgroundColor;while(bg==='rgba(0, 0, 0, 0)'&&parent.parentElement){parent=parent.parentElement;bg=getComputedStyle(parent).backgroundColor;}const a=lum(style.color),b=lum(bg);return {mode:el.dataset.mode,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),background:bg};});
 });
}
try {
 await page.goto(origin);await page.getByRole('heading',{name:'Connections'}).waitFor();
 assert.equal(await page.locator('[name="telegram.channelName"]').inputValue(),'GO Classes');
 assert.equal(await page.locator('[name="telegram.channelUrl"]').inputValue(),'https://t.me/goclasses_cse');
 const request=page.waitForRequest(r=>r.url().endsWith('/api/logins')&&r.method()==='POST');
 await page.getByRole('button',{name:'Check logins',exact:true}).click();assert.deepEqual((await request).postDataJSON().selected,PLATFORMS.map(p=>p.id));
 await page.waitForFunction(n=>document.querySelector('#verified-count')?.textContent.startsWith(n+' of'),PLATFORMS.length);
 assert.deepEqual(checks,PLATFORMS.map(p=>p.id));assert(checks.includes('whatsapp'));assert(checks.includes('telegram'));
 for(const id of ['whatsapp','telegram']) {
  const single=page.waitForRequest(r=>r.url().endsWith('/api/logins')&&r.method()==='POST');await page.locator('[data-check-login="'+id+'"]').click();assert.deepEqual((await single).postDataJSON().selected,[id]);
  await page.locator('[data-check-login="'+id+'"]:not([disabled])').waitFor();
 }
 await page.getByRole('button',{name:'Compose',exact:true}).click();
 assert.equal(await page.locator('[data-destination="whatsapp"]').getAttribute('aria-pressed'),'false','Login checks never change posting selection');
 assert.equal(await page.locator('[data-destination="telegram"]').getAttribute('aria-pressed'),'false');
 await page.locator('[data-caption-tab="telegram"]').click();await page.locator('#caption-telegram').fill('Telegram caption ✅');assert.match(await page.locator('#count-telegram').innerText(),/4,096/);
 await page.locator('[data-action="theme"]').click();
 assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 assert(await page.evaluate(()=>!!customElements.get('wa-button-group')&&!!document.querySelector('wa-button-group').shadowRoot));
 for(const c of await contrast()) assert(c.ratio>=4.5,JSON.stringify(c));
 assert.equal((await contrast()).find(c=>c.mode==='TEST').background,'rgb(116, 219, 172)');
 await page.locator('#live-mode').focus();await page.keyboard.press('Enter');await page.getByRole('heading',{name:'Switch to live publishing?'}).waitFor();assert.equal(await page.locator('#test-mode').getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Enable live mode',exact:true}).click();assert.equal(await page.locator('#live-mode').getAttribute('aria-pressed'),'true');
 for(const c of await contrast()) assert(c.ratio>=4.5,JSON.stringify(c));
 assert.equal((await contrast()).find(c=>c.mode==='LIVE').background,'rgb(255, 155, 174)');
 await page.locator('#toasts button').evaluateAll(buttons=>buttons.forEach(button=>button.click()));
 await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/telegram-dark-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/telegram-dark-mobile.png',fullPage:true});
 await page.locator('#test-mode').click();await page.locator('[data-action="theme"]').click();for(const c of await contrast())assert(c.ratio>=4.5,JSON.stringify(c));
 await page.reload();await page.getByRole('button',{name:'Compose',exact:true}).click();assert.equal(await page.locator('#test-mode').getAttribute('aria-pressed'),'true');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('Connections/UI passed: all eight logins checked independently of saved destinations; individual WhatsApp/Telegram checks; local Web Awesome components; >4.5:1 mode text contrast in light/dark; keyboard LIVE consent and TEST reset; responsive layout; no console or external network errors.');
} finally {await browser.close();server.closeAllConnections();server.close();}
