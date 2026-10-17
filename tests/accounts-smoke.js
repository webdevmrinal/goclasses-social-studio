// Account controls are fulfilled from local fixtures; no social requests leave this test.
// Copyright (c) 2026 Mrinal. All rights reserved.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { checkLogin, readXAccount, readYouTubeChannel } from '../server/automation/platforms.js';
import { ReadinessError, AccountMismatchError, InterventionError } from '../server/automation/utils.js';

const channels = {
  da: { id: 'UCkOaW747107QQNo-o0yhJGg', name: 'GO Classes for GATE DA', handle: 'GOClassesforGATEDA' },
  cs: { id: 'UCyvbBJhLJ-5YqwPA884vj0Q', name: 'GO Classes for GATE CS', handle: 'GOClassesforGATECS' }
};
function youtubeFixture(channel) {
  return `<!doctype html><style>[hidden]{display:none!important}ytd-multi-page-menu-renderer,ytd-account-item-renderer{display:block;padding:12px}</style>
    <h1>${channel.name}</h1><button id="avatar-btn" aria-label="Account menu">Account</button>
    <ytd-multi-page-menu-renderer hidden></ytd-multi-page-menu-renderer>
    <script>
      const channels=${JSON.stringify(channels)};
      const current=${JSON.stringify(channel)};
      window.ytInitialData={metadata:{channelMetadataRenderer:{externalId:current.id,title:current.name,vanityChannelUrl:'https://www.youtube.com/@'+current.handle}}};
      if(!localStorage.getItem('fixture-active')) localStorage.setItem('fixture-active','cs');
      const menu=document.querySelector('ytd-multi-page-menu-renderer');
      document.querySelector('#avatar-btn').onclick=()=>{
        const active=channels[localStorage.getItem('fixture-active')];
        menu.hidden=false;
        menu.innerHTML='<div id="account-name">'+active.name+'</div><div id="channel-handle">@'+active.handle+'</div><button id="switch">Switch account</button>';
        document.querySelector('#switch').onclick=()=>{
          menu.innerHTML=Object.entries(channels).map(([key,c])=>'<ytd-account-item-renderer style="display:contents" data-channel="'+key+'"><div role="option"><div id="channel-title">'+c.name+'</div>\\n<div>@'+c.handle+'</div></div></ytd-account-item-renderer>').join('');
          menu.querySelectorAll('ytd-account-item-renderer').forEach(item=>item.onclick=()=>{
            const notice=document.createElement('div');notice.setAttribute('role','dialog');
            notice.innerHTML='Your private activity, such as searching and watching videos would be attributed to your personal account <button>Got it</button>';
            document.body.append(notice);
            notice.querySelector('button').onclick=()=>{
              localStorage.setItem('fixture-active',item.dataset.channel);
              localStorage.setItem('fixture-switches',Number(localStorage.getItem('fixture-switches')||0)+1);
              menu.hidden=true;
              // Editor access needs this notice acknowledged before navigation.
              setTimeout(()=>location.reload(),30);
            };
          });
        };
      };
      document.addEventListener('keydown',event=>{if(event.key==='Escape')menu.hidden=true});
    </script>`;
}

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mrinal-account-checks-'));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
let xDelay = 650;
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.hostname === '127.0.0.1') return route.continue();
  if (url.hostname === 'www.youtube.com') {
    const channel = url.pathname.includes(channels.da.handle) || url.pathname.includes(channels.da.id) ? channels.da : channels.cs;
    return route.fulfill({ contentType: 'text/html', body: youtubeFixture(channel) });
  }
  if (url.hostname === 'x.com') {
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="loading" role="progressbar">Loading</div><div id="account"></div><script>setTimeout(()=>{document.querySelector('#account').innerHTML='<button data-testid="SideNav_AccountSwitcher_Button">GO Classes@GOClasses_CSE</button>';document.querySelector('#loading').remove()},${xDelay})</script>` });
  }
  return route.abort();
});
const pages = new Map();
const worker = { async page(id) { if (!pages.has(id)) pages.set(id, await context.newPage()); const page = pages.get(id); await page.bringToFront(); return page; } };
const { app, queue } = await createApp({ dataDir, browser: worker });
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  const checked = await fetch(origin + '/api/logins', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ selected: ['youtubeDA', 'youtubeCS', 'x'] }) });
  assert.equal(checked.status, 202);
  const deadline = Date.now() + 20000;
  while (queue.login.running) { if (Date.now() > deadline) throw new Error(JSON.stringify(queue.login)); await new Promise(resolve => setTimeout(resolve, 25)); }
  for (const id of ['youtubeDA', 'youtubeCS', 'x']) assert.equal(queue.login.items[id].status, 'verified', `${id}: ${queue.login.items[id].message}`);
  const bootstrap = await (await fetch(origin + '/api/bootstrap')).json();
  assert.equal(bootstrap.config.platforms.youtubeDA.channelId, channels.da.id);
  assert.equal(bootstrap.config.platforms.youtubeCS.channelId, channels.cs.id);
  assert.equal(bootstrap.config.platforms.x.handle, 'GOClasses_CSE');
  const persisted = JSON.parse(await fs.readFile(path.join(dataDir, 'config.json'), 'utf8'));
  assert.deepEqual(persisted, bootstrap.config);
  assert.equal(queue.state().config.platforms.youtubeCS.channelId, channels.cs.id);
  assert.equal(await pages.get('youtubeCS').evaluate(() => localStorage.getItem('fixture-active')), 'cs');
  assert.equal(await pages.get('youtubeCS').evaluate(() => localStorage.getItem('fixture-switches')), '2');
  const xPage = pages.get('x'); xDelay = 750;
  await xPage.goto('https://x.com/home');
  const started = Date.now();
  assert.equal(await readXAccount(xPage), 'GOClasses_CSE');
  assert(Date.now() - started >= 500, 'Check must wait for actual account content, not just DOM load');
  xDelay = 10000; await xPage.goto('https://x.com/home');
  await assert.rejects(readXAccount(xPage, 100), ReadinessError);
  await xPage.goto('https://x.com/i/flow/login');
  await assert.rejects(readXAccount(xPage), InterventionError);
  const csPage = pages.get('youtubeCS'); await csPage.goto('https://www.youtube.com/@GOClassesforGATECS');
  await assert.rejects(readYouTubeChannel(csPage, { channelId: channels.da.id, channelName: channels.da.name, handle: channels.da.handle }), AccountMismatchError);
  console.log('Account checks passed: shared YouTube login switches CS -> DA -> CS, exact channel checks, automatic ID/handle persistence, delayed X account text, loading timeout, and sign-in URL detection.');
} finally { await browser.close(); server.closeAllConnections(); server.close(); }
