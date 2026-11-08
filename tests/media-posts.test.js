// Copyright (c) 2026 Mrinal. Fully intercepted browser fixtures; no real social uploads.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';
import { singleAttachment, documentPostTitle, uploadSingleAttachment, assertEmptyMediaEditor, videoPreview, verifyVideoPreview, documentPreview, prepareInstagramReel, prepareLinkedInVideo, prepareLinkedInDocument, prepareXVideo, confirmLinkedInMediaPublication } from '../server/automation/media-posts.js';

const video={kind:'video',name:'Reviewed Reel.mp4',format:'mp4',durationSeconds:5,width:720,height:1280,size:100000};
const pdf={kind:'document',name:'Application_Guide.pdf',format:'pdf',size:2000};
const file=kind=>({name:kind==='video'?'reviewed.mp4':'reviewed.pdf',mimeType:kind==='video'?'video/mp4':'application/pdf',buffer:Buffer.from(kind==='video'?'offline-video-fixture':'%PDF-1.7\n%%EOF')});
const config={platforms:{instagram:{handle:'goclasses_cse'},linkedin:{companyPageUrl:'https://www.linkedin.com/company/42/admin/dashboard/',companyName:'GO Classes'}}};
const caption='Reviewed announcement ✅\n\nApplication details https://example.com/apply';
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
const fakeVideo=`function makeVideo(parent,source='blob:reviewed-video'){const v=document.createElement('video');v.setAttribute('src',source);v.style.cssText='display:block;width:140px;height:240px';for(const [key,value]of Object.entries({readyState:1,videoWidth:720,videoHeight:1280,duration:5,error:null}))Object.defineProperty(v,key,{value,configurable:true});parent.append(v);return v;}`;
async function fixture(t,html,url='https://fixture.example/'){
 const context=await browser.newContext();t.after(()=>context.close());await context.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html}));const page=await context.newPage();await page.goto(url);return {context,page};
}
function ctx(page,kind,{mode='TEST',confirmedLive=false,...overrides}={}){return {page,id:kind==='document'?'linkedin':'x',files:[file(kind)],media:[kind==='document'?pdf:video],caption,config,mode,confirmedLive,step:async()=>{},snapshot:async()=>{},markSubmitting:async()=>assert.fail('TEST cannot mark submission'),...overrides};}

test('video attachment preparation requires exact type, one file and probed dimensions/duration',()=>{
 assert.equal(singleAttachment({files:['one.mp4'],media:[video]},'video'),video);
 for(const value of [{files:[],media:[video]},{files:['a','b'],media:[video,video]},{files:['a'],media:[pdf]},{files:['a'],media:[{...video,durationSeconds:NaN}]},{files:['a'],media:[{...video,width:0}]}])assert.throws(()=>singleAttachment(value,'video'));
 assert.throws(()=>singleAttachment({files:['one.pdf'],media:[{...pdf,format:'docx'}]},'document'),/PDF/);
});
test('PDF document titles come from the reviewed name and respect the native 100-character limit',()=>{
 assert.equal(documentPostTitle(pdf),'Application Guide');assert.equal(documentPostTitle({name:' .pdf'}),'Document');assert.equal([...documentPostTitle({name:'🎓'.repeat(110)+'.pdf'})].length,100);assert.equal(documentPostTitle({...pdf,documentTitle:'Application form'}),'Application form');
});
test('video uploads select a compatible input inside the active editor only',async t=>{
 const {page}=await fixture(t,'<input id="unrelated" type="file" accept="video/*"><div role="dialog"><input id="photo" type="file" accept="image/*"><input id="reviewed" type="file" accept="video/mp4"></div>');
 await uploadSingleAttachment(page,page.getByRole('dialog'),ctx(page,'video'),'video');assert.equal(await page.locator('#reviewed').evaluate(el=>el.files[0].name),'reviewed.mp4');assert.equal(await page.locator('#unrelated').evaluate(el=>el.files.length),0);assert.equal(await page.locator('#photo').evaluate(el=>el.files.length),0);
});
test('PDF inputs preserve the reviewed original filename and exact bytes from UUID storage',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'studio-pdf-name-')),stored=path.join(directory,'c317e074-782c-439e-bd2b-8ef4540cd4fa.pdf'),bytes=Buffer.from('%PDF-1.7\nReviewed original bytes\n%%EOF'),name='Application guide – हिंदी.pdf';await fs.writeFile(stored,bytes);t.after(async()=>{await fs.unlink(stored);await fs.rmdir(directory);});
 const {page}=await fixture(t,'<input id="unrelated" type="file" accept="application/pdf"><div role="dialog"><input id="document" type="file" accept="application/pdf"></div>');await uploadSingleAttachment(page,page.getByRole('dialog'),{...ctx(page,'document'),files:[stored],media:[{...pdf,name,size:bytes.length}]},'document');const uploaded=await page.locator('#document').evaluate(async el=>({name:el.files[0].name,type:el.files[0].type,bytes:[...new Uint8Array(await el.files[0].arrayBuffer())]}));assert.equal(uploaded.name,name);assert.equal(uploaded.type,'application/pdf');assert.deepEqual(uploaded.bytes,[...bytes]);assert.equal(await page.locator('#unrelated').evaluate(el=>el.files.length),0);
});
test('ambiguous upload controls and stale attachments stop before inserting another file',async t=>{
 const {page}=await fixture(t,'<div role="dialog"><input type="file" accept="video/*"><input type="file" accept="video/mp4"></div>');const dialog=page.getByRole('dialog');await assert.rejects(uploadSingleAttachment(page,dialog,ctx(page,'video'),'video'),/more than one/);await page.locator('input').first().setInputFiles(file('video'));await assert.rejects(assertEmptyMediaEditor(dialog,'X'),/already has an attachment/);
});
test('video previews require loaded metadata and retain the reviewed duration/aspect',async t=>{
 const {page}=await fixture(t,`<div role="dialog"></div><script>${fakeVideo}makeVideo(document.querySelector('[role="dialog"]'));</script>`);const dialog=page.getByRole('dialog'),proof=await videoPreview(dialog,video,{timeout:500});assert.equal(proof.duration,5);await verifyVideoPreview(dialog,video,proof);await page.locator('video').evaluate(el=>el.src='blob:changed');await assert.rejects(verifyVideoPreview(dialog,video,proof),/changed after preparation/);
});
test('unloaded, duplicate, wrong-duration, wrong-ratio and processing videos never pass readiness',async t=>{
 for(const update of ['Object.defineProperty(v,"readyState",{value:0})','makeVideo(parent)','Object.defineProperty(v,"duration",{value:7})','Object.defineProperty(v,"videoWidth",{value:1280})','parent.insertAdjacentHTML("beforeend",\'<div role="progressbar"></div>\')']){
  const {page}=await fixture(t,`<div role="dialog"></div><script>${fakeVideo}const parent=document.querySelector('[role="dialog"]'),v=makeVideo(parent);${update};</script>`);await assert.rejects(videoPreview(page.getByRole('dialog'),video,{timeout:50}),/video preview/);
 }
});
test('PDF readiness needs both the exact document title and an actual visible preview',async t=>{
 const {page}=await fixture(t,'<div role="dialog"><input aria-label="Document title" value="Application Guide"><canvas hidden width="20" height="20"></canvas></div>');const dialog=page.getByRole('dialog');await assert.rejects(documentPreview(dialog,'Application Guide',{timeout:50}),/PDF title and document preview/);await page.locator('canvas').evaluate(el=>el.hidden=false);assert.equal((await documentPreview(dialog,'Application Guide',{timeout:500})).title,'Application Guide');await assert.rejects(documentPreview(dialog,'Another title',{timeout:50}),/PDF title/);
});

const xHTML=`<!doctype html><meta charset="utf-8"><div role="dialog"><input id="media" type="file" accept="image/*,video/*"><div data-testid="attachments" hidden></div><textarea data-testid="tweetTextarea_0"></textarea><button data-testid="tweetButton">Post</button></div><script>${fakeVideo}document.querySelector('#media').onchange=()=>{const box=document.querySelector('[data-testid="attachments"]');box.hidden=false;makeVideo(box)};document.querySelector('[data-testid="tweetButton"]').onclick=()=>{window.recordSubmit();document.body.insertAdjacentHTML('beforeend','<p>Your post was sent</p>')};</script>`;
test('X TEST prepares one video and its exact caption without clicking Post',async t=>{
 const {page}=await fixture(t,xHTML,'https://x.com/compose/post');let posts=0,ready=0;await page.exposeFunction('recordSubmit',()=>posts++);const result=await prepareXVideo(ctx(page,'video',{snapshot:async label=>{if(label==='ready-to-publish'){ready++;assert.equal(await page.getByTestId('tweetTextarea_0').inputValue(),caption);assert.equal(await page.locator('video').count(),1);}}}));assert.equal(result,'dry_run');assert.equal(posts,0);assert.equal(ready,1);
});
test('X LIVE has exactly one persisted submission and final Post click',async t=>{
 const {page}=await fixture(t,xHTML,'https://x.com/compose/post'),events=[];await page.exposeFunction('recordSubmit',()=>events.push('click'));const result=await prepareXVideo(ctx(page,'video',{mode:'LIVE',confirmedLive:true,markSubmitting:async()=>events.push('mark')}));assert.equal(result,'posted');assert.deepEqual(events,['mark','click']);
});
test('X stops a changed video before any final action even after the initial review',async t=>{
 const {page}=await fixture(t,xHTML,'https://x.com/compose/post');let posts=0,marks=0;await page.exposeFunction('recordSubmit',()=>posts++);await assert.rejects(prepareXVideo(ctx(page,'video',{mode:'LIVE',confirmedLive:true,markSubmitting:async()=>marks++,snapshot:async label=>{if(label==='ready-to-publish')await page.locator('video').evaluate(el=>el.src='blob:substituted');}})),/changed after preparation/);assert.equal(posts,0);assert.equal(marks,0);
});
test('LIVE video preparation without confirmation never marks or submits',async t=>{
 const {page}=await fixture(t,xHTML,'https://x.com/compose/post');let posts=0;await page.exposeFunction('recordSubmit',()=>posts++);await assert.rejects(prepareXVideo(ctx(page,'video',{mode:'LIVE'})),/explicit confirmation/);assert.equal(posts,0);
});

const instagramHTML=`<!doctype html><meta charset="utf-8"><button id="create">Create</button><script>${fakeVideo}let stage=0;const markup=()=>'<div role="dialog"><input type="file" accept="image/*,video/*"><button id="choose">Select from computer</button><div id="video"></div><button id="next">Next</button></div>';document.querySelector('#create').onclick=()=>{document.body.insertAdjacentHTML('beforeend',markup());document.querySelector('input').onchange=()=>{document.querySelector('#choose').remove();makeVideo(document.querySelector('#video'))};document.querySelector('#choose').onclick=()=>document.querySelector('input').click();document.querySelector('#next').onclick=()=>{stage++;if(stage===2){document.querySelector('#next').remove();document.querySelector('[role="dialog"]').insertAdjacentHTML('beforeend','<textarea aria-label="Write a caption"></textarea><button id="share">Share</button>');document.querySelector('#share').onclick=()=>{window.recordSubmit();document.body.insertAdjacentHTML('beforeend','<p>Your reel has been shared</p>')}}}};</script>`;
test('Instagram Reel TEST passes crop/edit stages and reviews its video/caption without sharing',async t=>{
 const {page}=await fixture(t,instagramHTML,'https://www.instagram.com/');let posts=0;await page.exposeFunction('recordSubmit',()=>posts++);const result=await prepareInstagramReel(ctx(page,'video',{id:'instagram',snapshot:async label=>{if(label==='ready-to-publish')assert.equal(await page.locator('textarea').inputValue(),caption);}}));assert.equal(result,'dry_run');assert.equal(posts,0);
});
test('Instagram Reel publication recognizes the native Reel receipt after a single Share',async t=>{
 const {page}=await fixture(t,instagramHTML,'https://www.instagram.com/'),events=[];await page.exposeFunction('recordSubmit',()=>events.push('share'));const result=await prepareInstagramReel(ctx(page,'video',{id:'instagram',mode:'LIVE',confirmedLive:true,markSubmitting:async()=>events.push('mark')}));assert.equal(result,'posted');assert.deepEqual(events,['mark','share']);
});

const linkedInHTML=`<!doctype html><meta charset="utf-8"><button id="start">Start a post</button><script>${fakeVideo}const receipt=()=>{window.recordSubmit();document.body.insertAdjacentHTML('beforeend','<div role="dialog"><h2>Post successful</h2><a href="https://www.linkedin.com/feed/update/urn:li:activity:123?actorCompanyId=42">View post</a></div>')};document.querySelector('#start').onclick=()=>{document.body.insertAdjacentHTML('beforeend','<div id="composer" role="dialog" aria-label="Create post modal"><p>GO Classes</p><input id="video-file" type="file" accept="video/*"><textarea aria-label="Text editor for creating content"></textarea><button id="more">More</button><button id="document" hidden>Add a document</button><button id="post">Post</button></div>');document.querySelector('#post').onclick=receipt;document.querySelector('#video-file').onchange=()=>{document.body.insertAdjacentHTML('beforeend','<div id="editor" role="dialog" aria-label="Editor"><div id="preview"></div><button id="next">Next</button></div>');makeVideo(document.querySelector('#preview'));document.querySelector('#next').onclick=()=>{document.querySelector('#editor').remove();makeVideo(document.querySelector('#composer'))}};document.querySelector('#more').onclick=()=>document.querySelector('#document').hidden=false;document.querySelector('#document').onclick=()=>{document.body.insertAdjacentHTML('beforeend','<div id="picker" role="dialog"><button id="choose-pdf">Choose file</button><input id="pdf-file" type="file" accept="application/pdf"><input aria-label="Document title"><canvas hidden width="20" height="20"></canvas><button id="done">Done</button></div>');document.querySelector('#choose-pdf').onclick=()=>document.querySelector('#pdf-file').click();document.querySelector('#pdf-file').onchange=()=>document.querySelector('#picker canvas').hidden=false;document.querySelector('#done').onclick=()=>{const title=document.querySelector('#picker input[aria-label]').value;document.querySelector('#picker').remove();document.querySelector('#composer').insertAdjacentHTML('beforeend','<div class="share-document-preview"><span>'+title+'</span><canvas width="20" height="20"></canvas></div>')}}};</script>`;
test('LinkedIn video TEST returns from its native editor to the company caption without posting',async t=>{
 const {page}=await fixture(t,linkedInHTML,config.platforms.linkedin.companyPageUrl);let posts=0;await page.exposeFunction('recordSubmit',()=>posts++);const result=await prepareLinkedInVideo(ctx(page,'video',{id:'linkedin'}));assert.equal(result,'dry_run');assert.equal(posts,0);
});
test('LinkedIn PDF uses the document picker, original title and intermediate Done but never Post in TEST',async t=>{
 const {page}=await fixture(t,linkedInHTML,config.platforms.linkedin.companyPageUrl);let posts=0,title;await page.exposeFunction('recordSubmit',()=>posts++);const result=await prepareLinkedInDocument(ctx(page,'document',{snapshot:async label=>{if(label==='ready-to-publish'){title=await page.locator('.share-document-preview span').innerText();assert.equal(await page.locator('textarea').inputValue(),caption);}}}));assert.equal(result,'dry_run');assert.equal(title,'Application Guide');assert.equal(posts,0);
});
test('LinkedIn video LIVE confirms an exact company-owned native receipt after one Post',async t=>{
 const {page}=await fixture(t,linkedInHTML,config.platforms.linkedin.companyPageUrl),events=[];await page.exposeFunction('recordSubmit',()=>events.push('post'));const result=await prepareLinkedInVideo(ctx(page,'video',{id:'linkedin',mode:'LIVE',confirmedLive:true,markSubmitting:async()=>events.push('mark')}));assert.equal(result.status,'posted');assert.equal(result.publication.postUrl,'https://www.linkedin.com/feed/update/urn:li:activity:123');assert.deepEqual(events,['mark','post']);
});
test('LinkedIn PDF LIVE confirms the company-owned receipt after one document Post',async t=>{
 const {page}=await fixture(t,linkedInHTML,config.platforms.linkedin.companyPageUrl),events=[];await page.exposeFunction('recordSubmit',()=>events.push('post'));const result=await prepareLinkedInDocument(ctx(page,'document',{mode:'LIVE',confirmedLive:true,markSubmitting:async()=>events.push('mark')}));assert.equal(result.status,'posted');assert.equal(result.publication.verifiedBy,'native_receipt');assert.deepEqual(events,['mark','post']);
});
test('LinkedIn PDF preflight verifies the original filename when the native composer retains its File object',async t=>{
 const retained=linkedInHTML.replace("document.querySelector('#picker').remove();document.querySelector('#composer').insertAdjacentHTML", "document.querySelector('#composer').append(document.querySelector('#pdf-file'));document.querySelector('#picker').remove();document.querySelector('#composer').insertAdjacentHTML");const {page}=await fixture(t,retained,config.platforms.linkedin.companyPageUrl);let posts=0;await page.exposeFunction('recordSubmit',()=>posts++);const result=await prepareLinkedInDocument(ctx(page,'document',{snapshot:async label=>{if(label==='ready-to-publish')assert.equal(await page.locator('#pdf-file').evaluate(el=>el.files[0].name),pdf.name);}}));assert.equal(result,'dry_run');assert.equal(posts,0);
});
test('LinkedIn rejects a substituted PDF File object after review before its final Post',async t=>{
 const retained=linkedInHTML.replace("document.querySelector('#picker').remove();document.querySelector('#composer').insertAdjacentHTML", "document.querySelector('#composer').append(document.querySelector('#pdf-file'));document.querySelector('#picker').remove();document.querySelector('#composer').insertAdjacentHTML");const {page}=await fixture(t,retained,config.platforms.linkedin.companyPageUrl);let posts=0,marks=0;await page.exposeFunction('recordSubmit',()=>posts++);await assert.rejects(prepareLinkedInDocument(ctx(page,'document',{mode:'LIVE',confirmedLive:true,markSubmitting:async()=>marks++,snapshot:async label=>{if(label==='ready-to-publish'){await page.locator('#pdf-file').evaluate(el=>el.onchange=null);await page.locator('#pdf-file').setInputFiles({...file('document'),name:'Another application.pdf'});}}})),/upload input no longer matches/);assert.equal(posts,0);assert.equal(marks,0);
});

test('LinkedIn media confirmation rejects stale receipts, other companies and a text-only feed card',async t=>{
 const existing='https://www.linkedin.com/feed/update/urn:li:activity:123';
 const cases=[
  {body:'<div role="dialog"><h2>Post successful</h2><a href="'+existing+'?actorCompanyId=42">View post</a></div>',baseline:[existing]},
  {body:'<div role="dialog"><h2>Post successful</h2><a href="'+existing+'?actorCompanyId=99">View post</a></div>',baseline:[]},
  {body:'<div data-urn="urn:li:activity:123"><div class="update-components-actor"><span class="update-components-actor__name">GO Classes</span><a href="/company/42/">GO Classes</a></div><div class="update-components-text">'+caption+'</div></div>',baseline:[]}
 ];
 for(const value of cases){const {page}=await fixture(t,value.body,config.platforms.linkedin.companyPageUrl);await assert.rejects(confirmLinkedInMediaPublication({page,expected:config.platforms.linkedin,caption,baseline:value.baseline,kind:'video',timeout:20}),/not confirmed one new matching media post/);}
});
