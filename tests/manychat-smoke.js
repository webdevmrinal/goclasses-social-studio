// Copyright (c) 2026 Mrinal. All pages are local fixtures; no live automation is activated.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { prepareManychat } from '../server/automation/manychat.js';
import { instagramBaseline, instagramPublication } from '../server/automation/instagram-reference.js';
import { defaults } from '../server/config.js';
import { replyBatch } from '../shared/manychat.js';

const caption = 'A new post ✅\n\nहिन्दी details';
const posts = [
  { url: 'https://www.instagram.com/p/OTHER/', caption: 'Another team member posted this' },
  { url: 'https://www.instagram.com/p/OLD/', caption },
  { url: 'https://www.instagram.com/p/NEW/', caption }
];
const picture = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="blue"/></svg>');
function fixture() {
  return `<!doctype html><meta charset="utf-8"><style>[hidden]{display:none!important}button,[role=button]{padding:8px}section{border:1px solid #ddd;padding:8px}img{width:10px;height:10px}</style>
  <div id="prompt"><span>Continue or start fresh?</span><button onclick="document.querySelector('#prompt').hidden=true;document.querySelector('#builder').hidden=false">Continue</button></div>
  <div id="builder" hidden>
    <section role="region"><h2>When someone comments on</h2><label><input type="radio" name="area" aria-label="a specific post or reel" checked>a specific post or reel</label><button data-test-id="ig-media-select-item" aria-selected="true"><img src="${picture}"></button><button onclick="document.querySelector('#picker').hidden=false">Show all</button><button id="post-next" onclick="this.hidden=true;document.querySelector('#comments').hidden=false">Next</button></section>
    <section role="region" id="comments" hidden><h2>And this comment has</h2><input type="radio" name="words" aria-label="any word"><input type="checkbox" aria-label="reply to their comments under the post"><input placeholder="Write a reply"><input placeholder="Write a reply"><input placeholder="Write a reply"><button onclick="this.hidden=true;document.querySelector('#opening').hidden=false">Next</button></section>
    <section role="region" id="opening" hidden><h2>They will get</h2><input type="checkbox" aria-label="an opening DM"><textarea placeholder="Do a quick vibe check first - are you ready for the link?"></textarea><input data-test-id="optional-opening-dm-button"><input type="checkbox" aria-label="a DM asking to follow you before they get the link"><input type="checkbox" aria-label="a DM asking for their email"><button onclick="this.hidden=true;document.querySelector('#final').hidden=false">Next</button></section>
    <section role="region" id="final" hidden><h2>And then, they will get</h2><div data-test-id="direct-response-multi-links"><textarea placeholder="Write a message"></textarea><div id="buttons"><div data-title="https://old.example/" onclick="editLink(this)"><span>Stale draft link</span></div></div><button onclick="editLink(null)">Add a link</button></div><input type="checkbox" aria-label="a follow up DM if they don't click the link"></section>
    <div role="tablist"><button role="tab">DM</button></div><div data-test-id="phone-preview-header">goclasses_cse</div><button id="activate" onclick="activate()">Go live</button><div id="live" hidden><button>Edit</button><button>Stop</button></div>
  </div><div id="picker" hidden><h1>Pick any post or reel to automate</h1></div>
  <div id="link-editor" hidden><label>Button label<input id="label"></label><label>Link<input id="url"></label><button id="delete" onclick="editing.remove();document.querySelector('#link-editor').hidden=true">Delete link</button><button onclick="saveLink()">Save</button></div>
  <script>
  const posts=${JSON.stringify(pickerPosts)},picture=${JSON.stringify(picture)};let editing=null;window.activations=0;window.selected='';
  for(const post of posts){const card=document.createElement('div');card.setAttribute('role','button');const img=new Image();img.src=picture;img.alt=post.caption;const link=document.createElement('a');link.href=post.url;link.textContent='View On Instagram';card.append(img,link);card.onclick=()=>{window.selected=post.url;document.querySelector('#picker').hidden=true};document.querySelector('#picker').append(card)}
  function editLink(element){editing=element;document.querySelector('#link-editor').hidden=false;document.querySelector('#label').value=element?.textContent||'';document.querySelector('#url').value=element?.dataset.title||'';document.querySelector('#delete').hidden=!element}
  function saveLink(){if(editing)editing.remove();const element=document.createElement('div');element.dataset.title=document.querySelector('#url').value;const label=document.createElement('span');label.textContent=document.querySelector('#label').value;element.append(label);element.onclick=()=>editLink(element);document.querySelector('#buttons').append(element);document.querySelector('#link-editor').hidden=true}
  function activate(){window.activations++;window.testActivation();document.querySelector('#activate').hidden=true;document.querySelector('#live').hidden=false}
  </script>`;
}
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
let activations = 0, freshProfile = false, pickerPosts = posts;
await context.exposeBinding('testActivation', () => { activations++; });
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.hostname === 'app.manychat.com') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture() });
  if (url.hostname === 'www.instagram.com') {
    const cards = [{ url: '/goclasses_cse/p/PINNED/', caption: 'Pinned' }, ...posts.filter(post => freshProfile || post.url.endsWith('/OLD/'))];
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<main>${cards.map(post => `<a href="${post.url}"><img alt="${post.caption}" src="${picture}"></a>`).join('')}</main>` });
  }
  return route.abort();
});
const config = structuredClone(defaults); config.platforms.instagram.handle = 'goclasses_cse';
async function run(overrides = {}) {
  const page = await context.newPage();let prepared;const shots=[];
  const ctx = { page, id: 'manychat', config, caption: 'Your details ✅\n\nhttps://example.com/', mode: 'TEST', confirmedLive: false,
    manychat: { postUrl: '', links: [{ label: 'Details', url: 'https://example.com/' }], replies: replyBatch() },
    step: async () => {}, snapshot: async label => shots.push(label), markSubmitting: async () => {}, recordPreparation: async value => { prepared = value; }, ...overrides };
  try { return { result: await prepareManychat(ctx), prepared, shots }; }
  finally { if (!page.isClosed()) await page.close(); }
}
try {
  const baseline = await instagramBaseline(context, 'goclasses_cse');
  assert(baseline.includes('https://www.instagram.com/p/PINNED/'));
  freshProfile = true;
  const publication = await instagramPublication(context, 'goclasses_cse', baseline, caption);
  assert.equal(publication.postUrl, posts[2].url, 'Pinned and concurrent unrelated posts cannot win the match');
  const rehearsal = await run();
  assert.equal(rehearsal.result.status, 'dry_run'); assert.equal(activations, 0);
  assert.equal(rehearsal.prepared.postUrl, posts[0].url);assert.equal(rehearsal.prepared.testExistingPost, true);
  assert(rehearsal.shots.includes('ready-to-publish'));
  const repeatedLabels = await run({ manychat: { postUrl: '', replies: replyBatch(), links: [1, 2, 3].map(n => ({ label: 'Course details', url: `https://example.com/course/${n}` })) } });
  assert.equal(repeatedLabels.prepared.links.length, 3, 'Buttons with the same short label still retain their own URL');
  assert.equal(activations, 0);
  const exact = await run({ manychat: { postUrl: posts[1].url, links: [], replies: replyBatch(undefined, 3) } });
  assert.equal(exact.prepared.postUrl, posts[1].url); assert.equal(exact.prepared.testExistingPost, false);
  await assert.rejects(run({ mode: 'LIVE', confirmedLive: true }), /verified Instagram post/);assert.equal(activations, 0);
  await assert.rejects(run({ mode: 'LIVE', instagramPublication: publication, instagramCaption: caption }), /explicit confirmation/);assert.equal(activations, 0);
  const liveFixture = await run({ mode: 'LIVE', confirmedLive: true, instagramPublication: publication, instagramCaption: caption });
  assert.equal(liveFixture.prepared.postUrl, posts[2].url); assert.equal(liveFixture.result.status, 'posted'); assert.equal(activations, 1, 'Only a confirmed LIVE run clicks the local fixture button');
  const exactProof = { postUrl: posts[2].url, verifiedBy: 'operator_confirmation' };
  pickerPosts = posts.map(post => post.url === exactProof.postUrl ? { ...post, caption: 'Generated picker description' } : post);
  const recovered = await run({ mode: 'LIVE', confirmedLive: true, instagramPublication: exactProof, instagramCaption: caption });
  assert.equal(recovered.result.status, 'posted'); assert.equal(recovered.prepared.postUrl, exactProof.postUrl); assert.equal(activations, 2, 'An exact confirmed source works without a candidates array or picker alt-caption equality');
  pickerPosts = posts;
  for (const instagramPublication of [[posts[2].url], { candidates: posts[2].url }, { postUrl: 'https://evil.example/p/NEW/', candidates: [posts[2].url] }]) await assert.rejects(run({ mode: 'LIVE', confirmedLive: true, instagramPublication, instagramCaption: caption }), /verified Instagram post/);
  await assert.rejects(run({ mode: 'LIVE', confirmedLive: true, instagramPublication: { candidates: [posts[2].url] }, instagramCaption: 'A different reviewed caption' }), /intended Instagram post/);
  await assert.rejects(run({ mode: 'LIVE', confirmedLive: true, instagramPublication: { postUrl: 'https://www.instagram.com/p/MISSING/', candidates: [posts[2].url] }, instagramCaption: caption }), /intended Instagram post/);
  pickerPosts = [...posts, { ...posts[2] }];
  await assert.rejects(run({ mode: 'LIVE', confirmedLive: true, instagramPublication: exactProof, instagramCaption: caption }), /intended Instagram post/);
  await assert.rejects(run({ manychat: { postUrl: posts[2].url, links: [], replies: replyBatch() } }), /intended Instagram post/);
  pickerPosts = posts; assert.equal(activations, 2, 'Malformed, missing, caption-mismatched and duplicate references never activate');
  console.log('ManyChat browser fixtures passed: saved-draft prompt, exact post and caption binding, pinned posts, reply fields, stale-link removal, optional links, exact proof without candidates, malformed/duplicate source rejection, TEST guard, and Edit/Stop activation confirmation.');
} finally { await browser.close(); }
