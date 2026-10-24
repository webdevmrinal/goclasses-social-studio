// Copyright (c) 2026 Mrinal. All ManyChat pages are offline fixtures; no automation is activated.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { defaults } from '../server/config.js';
import { checkLogin } from '../server/automation/platforms.js';
import { manychatLoginUrl, verifyManychatAccount } from '../server/automation/manychat-login.js';
import { AccountMismatchError, InterventionError, ReadinessError } from '../server/automation/utils.js';

const workspace = 'fb5759472';
const libraryUrl = `https://app.manychat.com/${workspace}/cms`;
const builderUrl = `${libraryUrl}/easy-builder?campaign_type=easy_builder_cgt_next_post_multi_links`;
const config = structuredClone(defaults);
config.platforms.instagram.handle = 'goclasses_cse';
config.platforms.manychat.flowUrl = builderUrl;
const icon = '<svg width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="7"/></svg>';
const shell = (id = workspace) => `<nav><a href="/${id}/cms" aria-label="Automation">${icon}</a><a href="/${id}/dashboard" aria-label="Home">${icon}</a><a href="/${id}/settings" aria-label="Settings">${icon}</a></nav>`;
const builder = (handle = 'goclasses_cse') => `<main><h2>When someone comments on</h2><label><input type="radio" name="post" aria-label="a specific post or reel" checked>a specific post or reel</label><div data-test-id="phone-preview-header">${handle}</div><button>Go Live</button></main>`;
function fixture(content, delayed = '') {
  return `<!doctype html><meta charset="utf-8"><style>[hidden]{display:none!important}a{display:inline-block;padding:12px}button,input{padding:10px}</style><div id="content">${content}</div><script>
    window.fixtureActions={clicks:0,changes:0,submits:0};
    document.addEventListener('click',()=>window.fixtureActions.clicks++,true);
    document.addEventListener('input',()=>window.fixtureActions.changes++,true);
    document.addEventListener('change',()=>window.fixtureActions.changes++,true);
    document.addEventListener('submit',event=>{window.fixtureActions.submits++;event.preventDefault()},true);
    ${delayed}
  </script>`;
}
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const requests = [];
let body = fixture(shell());
await context.route('**/*', route => {
  const request = route.request();
  requests.push(request.url());
  // Every request is intercepted, including hostile-origin cases. No real social request leaves the test.
  return route.fulfill({ contentType: 'text/html; charset=utf-8', body });
});
const page = await context.newPage();
async function open(content, url = libraryUrl, delayed = '') {
  body = fixture(content, delayed);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
}
async function untouched(label) {
  assert.deepEqual(await page.evaluate(() => window.fixtureActions), { clicks: 0, changes: 0, submits: 0 }, `${label}: account verification must remain read-only`);
}
async function succeeds(content, { url = libraryUrl, delayed = '' } = {}) {
  await open(content, url, delayed);
  assert(await verifyManychatAccount(page, config, { timeout: 2500 }));
  await untouched('Signed-in check');
}
try {
  assert.equal(manychatLoginUrl(config), libraryUrl, 'A login check opens the workspace library, not a new automation draft');
  for (const flowUrl of [
    'http://app.manychat.com/fb5759472/cms',
    'https://app.manychat.com.evil.example/fb5759472/cms',
    'https://manychat.com/fb5759472/cms',
    'https://app.manychat.com:444/fb5759472/cms',
    'https://someone@app.manychat.com/fb5759472/cms',
    'https://app.manychat.com/not-a-workspace/cms'
  ]) {
    const invalid = structuredClone(config); invalid.platforms.manychat.flowUrl = flowUrl;
    assert.throws(() => manychatLoginUrl(invalid), undefined, flowUrl);
  }
  await succeeds(shell());
  assert.equal(await page.getByText('Automation', { exact: true }).count(), 0, 'The icon-only shell has no visible Automation text');
  await succeeds(shell() + builder(), { url: builderUrl });
  await succeeds(builder(), { url: builderUrl });
  await succeeds(shell() + '<div role="dialog"><h2>Continue or start fresh?</h2><button>Continue</button><button>Start fresh</button></div>', { url: builderUrl });
  assert.equal(await page.getByRole('dialog').count(), 1, 'Checking login leaves the unsaved-draft prompt alone');
  const delayedStart = Date.now();
  await succeeds('<div role="progressbar">Loading</div>', { delayed: `setTimeout(()=>document.querySelector('#content').innerHTML=${JSON.stringify(shell())},350)` });
  assert(Date.now() - delayedStart >= 300, 'Loading is awaited until authenticated workspace controls exist');

  await open(shell() + builder('another_account'), builderUrl);
  await assert.rejects(verifyManychatAccount(page, config, { timeout: 1000 }), AccountMismatchError, 'A valid workspace shell cannot override the wrong connected Instagram account');
  await untouched('Wrong Instagram preview');
  await open(shell('fb999999'), 'https://app.manychat.com/fb999999/cms');
  await assert.rejects(verifyManychatAccount(page, config, { timeout: 500 }), AccountMismatchError);
  await untouched('Wrong workspace');
  await open(shell() + builder(), 'https://app.manychat.com.evil.example/fb5759472/cms');
  await assert.rejects(verifyManychatAccount(page, config, { timeout: 500 }), error => error instanceof InterventionError && error.name === 'InterventionError');
  await untouched('Untrusted origin');
  await open('<form><h1>Log in to ManyChat</h1><label>Email<input type="email"></label><label>Password<input type="password"></label><button>Sign in</button></form>');
  await assert.rejects(verifyManychatAccount(page, config, { timeout: 500 }), error => error instanceof InterventionError && error.name === 'InterventionError');
  await untouched('Signed-out form');
  for (const content of [
    '<h1>Automation</h1><button>Go Live</button>',
    '<div role="progressbar">Loading</div>',
    `<div hidden>${shell()}</div>`
  ]) {
    await open(content);
    await assert.rejects(verifyManychatAccount(page, config, { timeout: 100 }), ReadinessError, 'Generic copy and hidden/stale controls do not prove login');
    await untouched('Unready page');
  }
  body = fixture(shell()); requests.length = 0;
  const checked = await checkLogin({ page, id: 'manychat', config, step: async () => {} });
  assert.equal(checked.status, 'verified', checked.message);
  assert.deepEqual(requests, [libraryUrl], 'The complete check never opens or edits a builder draft');
  assert.equal(page.url(), libraryUrl);
  await untouched('Full account check');
  console.log('ManyChat login fixtures passed: collapsed sidebar, builder proof, delayed loading, exact workspace/origin and account checks, signed-out/loading classification, read-only draft handling, and library-only login navigation.');
} finally { await browser.close(); }
