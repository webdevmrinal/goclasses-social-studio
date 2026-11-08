// Copyright (c) 2026 Mrinal. YouTube Studio is an offline, fully intercepted fixture.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { prepareYouTubeUpload, youtubeVideoTitle, youtubeVideoUrl } from '../server/automation/youtube-upload.js';

const channelId='UCabcdefghijklmnopqrstuv',otherChannel='UCzyxwvutsrqponmlkjihgfe',videoId='abcdefghijk',url='https://www.youtube.com/watch?v='+videoId;
const caption='Admissions update ✅\n\nFull details https://example.com/apply',buffer=Buffer.from('offline-video-payload');
const video={kind:'video',name:'Admissions.mp4',format:'mp4',width:720,height:1280,durationSeconds:15,size:buffer.length};
let browser;before(async()=>{browser=await chromium.launch({headless:true});});after(async()=>{await browser?.close();});
function markup({mutate='',processing=false,uploadFailure=false,receiptId=videoId,foreignRedirect=false}={}){
 return `<!doctype html><meta charset="utf-8"><style>ytcp-uploads-dialog,ytcp-video-share-dialog{display:block}#textbox{display:block;min-height:30px;white-space:pre-wrap}[hidden]{display:none!important}</style><button id="create">Create</button><script>
 window.nextCount=0;document.querySelector('#create').onclick=()=>{document.body.insertAdjacentHTML('beforeend','<button role="menuitem" id="upload">Upload videos</button>');document.querySelector('#upload').onclick=()=>{document.querySelector('#upload').remove();document.body.insertAdjacentHTML('beforeend',\`<ytcp-uploads-dialog><input id="file" type="file" accept="video/*"><button id="select">Select files</button><section id="details" hidden><div id="title-textarea"><div id="textbox" contenteditable="true"></div></div><div id="description-textarea"><div id="textbox" contenteditable="true"></div></div><input id="notkids" type="radio" name="audience" aria-label="No, it's not made for kids"></section><button id="next-button" hidden>Next</button><section id="visibility" hidden><input id="public" type="radio" name="visibility" aria-label="Public"><a id="video-link" href="https://youtu.be/${videoId}">Video link</a>${processing?'<p>Uploading your video</p><div role="progressbar"></div>':''}${uploadFailure?'<p>Upload failed</p>':''}<button id="done-button">Publish</button></section></ytcp-uploads-dialog>\`);document.querySelector('#select').onclick=()=>document.querySelector('#file').click();document.querySelector('#file').onchange=()=>{document.querySelector('#details').hidden=false;document.querySelector('#next-button').hidden=false};document.querySelector('#next-button').onclick=()=>{window.nextCount++;${mutate}if(window.nextCount===3){document.querySelector('#details').hidden=true;document.querySelector('#next-button').hidden=true;document.querySelector('#visibility').hidden=false;${foreignRedirect?`history.replaceState({},'', '/channel/${otherChannel}')`:''}}};document.querySelector('#done-button').onclick=()=>{window.recordPublish();document.querySelector('ytcp-uploads-dialog').hidden=true;document.body.insertAdjacentHTML('beforeend','<ytcp-video-share-dialog><h2>Video published</h2><a href="https://youtu.be/${receiptId}">Watch video</a></ytcp-video-share-dialog>')}}};
 </script>`;
}
async function fixture(t,options={}){
 const context=await browser.newContext();t.after(()=>context.close());const requests=[];await context.route('**/*',route=>{requests.push(route.request().url());return route.fulfill({contentType:'text/html; charset=utf-8',body:markup(options)});});const page=await context.newPage();let posts=0,marks=0;await page.exposeFunction('recordPublish',()=>posts++);
 const config={platforms:{youtubeDA:{channelId,channelName:'GO Classes for GATE DA',handle:'GOClassesforGATEDA'}}};
 const ctx={page,id:'youtubeDA',files:[{name:'Admissions.mp4',mimeType:'video/mp4',buffer}],media:[video],caption,config,mode:'TEST',confirmedLive:false,step:async()=>{},snapshot:async()=>{},markSubmitting:async()=>marks++};return {context,page,ctx,requests,posts:()=>posts,marks:()=>marks};
}

test('YouTube titles use the first nonempty caption line, remove angle brackets and keep Unicode intact',()=>{
 assert.equal(youtubeVideoTitle('\n\n Admissions update ✅\nDetails'),'Admissions update ✅');assert.equal(youtubeVideoTitle('A <new> update'),'A new update');assert.equal([...youtubeVideoTitle('🎓'.repeat(110))].length,100);assert.equal(youtubeVideoTitle('\n\n'),'');
});
test('YouTube video receipts canonicalize only exact native video IDs',()=>{
 for(const link of ['https://youtu.be/'+videoId,'https://www.youtube.com/watch?v='+videoId,'https://youtube.com/shorts/'+videoId])assert.equal(youtubeVideoUrl(link),url);
 for(const link of ['http://youtu.be/'+videoId,'https://evil.example/watch?v='+videoId,'https://youtube.com.evil.example/watch?v='+videoId,'https://someone@youtu.be/'+videoId,'https://youtu.be:444/'+videoId,'https://youtu.be/'+videoId+'/extra','https://youtu.be/short','javascript:alert(1)'])assert.equal(youtubeVideoUrl(link),null);
});
test('YouTube TEST prepares a private video upload, exact caption, audience and one receipt without Publish',async t=>{
 const f=await fixture(t),preparations=[];f.ctx.recordPreparation=async value=>preparations.push(value);const result=await prepareYouTubeUpload(f.ctx);assert.equal(result.status,'dry_run');assert.equal(f.posts(),0);assert.equal(f.marks(),0);assert.equal(await f.page.locator('#description-textarea #textbox').textContent(),caption);assert.equal(await f.page.locator('#title-textarea #textbox').textContent(),'Admissions update ✅');assert.equal(await f.page.locator('#details').isVisible(),false);assert.equal(await f.page.locator('#public').isChecked(),true);assert.equal(await f.page.locator('#notkids').isChecked(),true);assert.equal(await f.page.evaluate(()=>window.nextCount),3);assert.equal(preparations[0].postUrl,url);assert.equal(preparations[0].privateDraft,true);assert(f.requests.every(value=>value.startsWith('https://studio.youtube.com/')));
});
test('YouTube LIVE persists intent once and accepts only its exact published video receipt',async t=>{
 const f=await fixture(t),events=[];f.ctx.mode='LIVE';f.ctx.confirmedLive=true;f.ctx.markSubmitting=async()=>events.push('mark');await f.page.exposeFunction('trackSnapshot',()=>{});f.ctx.snapshot=async label=>{if(label==='published')events.push('receipt')};const result=await prepareYouTubeUpload(f.ctx);assert.equal(result.status,'posted');assert.equal(result.publication.postUrl,url);assert.equal(f.posts(),1);assert.deepEqual(events,['mark','receipt']);
});
test('YouTube LIVE requires explicit confirmation before persisting or publishing',async t=>{
 const f=await fixture(t);f.ctx.mode='LIVE';await assert.rejects(prepareYouTubeUpload(f.ctx),/explicit confirmation/);assert.equal(f.posts(),0);assert.equal(f.marks(),0);
});
test('a YouTube Studio channel change after Next blocks publication',async t=>{
 const f=await fixture(t,{foreignRedirect:true});await assert.rejects(prepareYouTubeUpload(f.ctx),/reviewed channel/);assert.equal(f.posts(),0);assert.equal(f.marks(),0);
});
test('YouTube rechecks hidden details after Next and rejects a changed description',async t=>{
 const f=await fixture(t,{mutate:`if(window.nextCount===1)document.querySelector('#description-textarea #textbox').textContent='Wrong caption';`});await assert.rejects(prepareYouTubeUpload(f.ctx),/does not match the reviewed draft/);assert.equal(f.posts(),0);assert.equal(f.marks(),0);
});
test('YouTube rejects changed title and audience settings while those details are hidden',async t=>{
 for(const mutate of [`if(window.nextCount===1)document.querySelector('#title-textarea #textbox').textContent='Wrong title';`,`if(window.nextCount===1)document.querySelector('#notkids').checked=false;`]){
  const f=await fixture(t,{mutate});await assert.rejects(prepareYouTubeUpload(f.ctx),/does not match|audience settings changed/);assert.equal(f.posts(),0);assert.equal(f.marks(),0);
 }
});
test('a changed YouTube link between review and the final click is blocked',async t=>{
 const f=await fixture(t);f.ctx.mode='LIVE';f.ctx.confirmedLive=true;f.ctx.snapshot=async label=>{if(label==='ready-to-publish')await f.page.locator('#video-link').evaluate(el=>el.href='https://youtu.be/zyxwvutsrqp')};await assert.rejects(prepareYouTubeUpload(f.ctx),/video link changed/);assert.equal(f.posts(),0);assert.equal(f.marks(),0);
});
test('a detached YouTube details panel is rejected instead of bypassing caption verification',async t=>{
 const f=await fixture(t,{mutate:`if(window.nextCount===3)queueMicrotask(()=>document.querySelector('#details').remove());`});await assert.rejects(prepareYouTubeUpload(f.ctx),/reviewed YouTube details are no longer available/);assert.equal(f.posts(),0);assert.equal(f.marks(),0);
});
test('an explicit native upload failure stops before publication',async t=>{
 const f=await fixture(t,{uploadFailure:true});await assert.rejects(prepareYouTubeUpload(f.ctx),/could not prepare this video/);assert.equal(f.posts(),0);assert.equal(f.marks(),0);
});
test('an unfinished YouTube upload keeps the job waiting and can be stopped without Publish',async t=>{
 const f=await fixture(t,{processing:true}),controller=new AbortController();f.ctx.signal=controller.signal;f.ctx.step=async()=>controller.signal.throwIfAborted();f.ctx.snapshot=async()=>controller.signal.throwIfAborted();const running=prepareYouTubeUpload(f.ctx);await f.page.waitForSelector('#visibility:not([hidden])',{timeout:5000});assert.equal(f.posts(),0);assert.equal(f.marks(),0);controller.abort(new Error('Stopped fixture upload'));await f.page.close();await assert.rejects(running);assert.equal(f.posts(),0);assert.equal(f.marks(),0);
});

test('YouTube does not confirm a different video receipt or repeat Publish when confirmation is missing',async t=>{
 const f=await fixture(t,{receiptId:'zyxwvutsrqp'});f.ctx.mode='LIVE';f.ctx.confirmedLive=true;let receipts=0;f.ctx.snapshot=async label=>{if(label==='published')receipts++};const running=prepareYouTubeUpload(f.ctx);await f.page.locator('ytcp-video-share-dialog').waitFor({state:'visible',timeout:5000});assert.equal(f.posts(),1);assert.equal(f.marks(),1);assert.equal(receipts,0);await f.page.close();await assert.rejects(running);assert.equal(f.posts(),1);assert.equal(receipts,0);
});

test('a substituted YouTube file is rejected before the public submission',async t=>{
 const f=await fixture(t);f.ctx.mode='LIVE';f.ctx.confirmedLive=true;f.ctx.snapshot=async label=>{if(label==='ready-to-publish')await f.page.locator('#file').setInputFiles({name:'different.mp4',mimeType:'video/mp4',buffer:Buffer.from('another-video-with-a-different-size')})};await assert.rejects(prepareYouTubeUpload(f.ctx),/attachment changed/);assert.equal(f.posts(),0);assert.equal(f.marks(),0);
});
