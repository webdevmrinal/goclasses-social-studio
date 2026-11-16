import test from 'node:test';import assert from 'node:assert/strict';
import {BrowserManager} from '../server/automation/browser.js';
test('completed app-owned tabs are closed and removed without touching adopted tabs',async()=>{
 const manager=new BrowserManager();let closed=0;
 const page={isClosed:()=>false,close:async()=>{closed++;}};manager.pages.set('whatsapp',page);manager.pages.set('alias',page);manager.ownedPages.add(page);
 assert.equal(await manager.release('whatsapp'),true);assert.equal(closed,1);assert.equal(manager.pages.size,0);
 manager.pages.set('telegram',page);manager.ownedPages=new WeakSet();assert.equal(await manager.release('telegram'),false);assert.equal(closed,1);
});
test('idle cleanup never closes a review tab or a newly active worker',async()=>{
 const manager=new BrowserManager();let closed=0;manager.close=async()=>{closed++;};
 manager.context={pages:()=>[{isClosed:()=>false,url:()=> 'https://example.test/preview'}]};
 manager.idle({delay:1});await new Promise(r=>setTimeout(r,10));assert.equal(closed,0);
 manager.context={pages:()=>[{isClosed:()=>false,url:()=> 'about:blank'}]};
 manager.idle({delay:1,canClose:()=>false});await new Promise(r=>setTimeout(r,10));assert.equal(closed,0);
 manager.idle({delay:1});await new Promise(r=>setTimeout(r,10));assert.equal(closed,1);
});
