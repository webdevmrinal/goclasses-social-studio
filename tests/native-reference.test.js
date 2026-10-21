// Copyright (c) 2026 Mrinal. Native receipt and caption guards; offline fixtures only.
import test from 'node:test';import assert from 'node:assert/strict';
import {nativeId} from '../server/automation/android-native.js';
import {nativeGridTiles,nativePostAuthor,nativePublishedCaption,copyNativePostUrl,verifyNativePost,verifyNativeViewer} from '../server/automation/native-reference.js';
import {nativeCaption,normalizeNativeCaption} from '../server/automation/native-music.js';
import {instagramHashtags} from '../shared/instagram.js';import {validateDraft} from '../shared/platforms.js';
import {Queue} from '../server/queue.js';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {defaults} from '../server/config.js';
const n=(id,text='',extra={})=>({'resource-id':id?nativeId(id):'',package:'com.instagram.android',displayed:'true',text,...extra});
test('five Instagram hashtags remain exact; additional tags are blocked before native typing',async()=>{
 const text='Hello \u2764\ufe0f\n\n#One #Two #Three #Four #Five';assert.equal(instagramHashtags(text).length,5);assert.equal(normalizeNativeCaption(text),text);assert.equal(instagramHashtags(text+' #Six').length,6);assert(validateDraft({selected:['instagram'],captions:{instagram:text+' #Six'}},[{id:'a'}]).some(e=>e.includes('5 hashtags')));await assert.rejects(nativeCaption({},text+' #Six'),/up to 5/);
});
test('native receipts ignore hidden posts, distinguish grid order and require exact author/caption',()=>{
 const tiles=nativeGridTiles([n('image_button','',{'content-desc':'Photo by Brand at Row 2, Column 1'}),n('image_button','',{'content-desc':'Photo by Brand at row 1, column 1'}),n('image_button','',{'content-desc':'Photo by Brand at Row 1, Column 2',displayed:'false'})]);assert.deepEqual(tiles.map(n=>n.ordinal),[0,3]);assert(nativePostAuthor([n('row_feed_photo_profile_name','ours')],'ours'));assert(!nativePostAuthor([n('row_feed_photo_profile_name','other'),n('','ours matches a comment')],'ours'));assert(!nativePostAuthor([n('row_feed_photo_profile_name','ours'),n('row_feed_photo_profile_name','other')],'ours'));assert.deepEqual(nativePublishedCaption([n('','ours Hello\nWorld'),n('','other Hello')],'ours').map(n=>n.caption),['Hello\nWorld']);
});
function receiptFixture(link){let sheet=false,clipboard='',sentinel=false;const calls=[];return {calls,s:{screen:async()=>sheet?[n('button','',{'content-desc':'Copy link'})]:[n('row_feed_button_share','',{'content-desc':'Send post. Button.'}),n('row_feed_photo_profile_name','ours')],find:async()=> 'share-control',until:async predicate=>assert(predicate(sheet?[n('button','',{'content-desc':'Copy link'})]:[])),click:async(using,value)=>{assert.match(value,/Copy link/);calls.push('copy');clipboard=link;sheet=false;},request:async(endpoint,method,body)=>{if(endpoint.includes('/click')){sheet=true;calls.push('public-share-sheet');return;}assert.equal(endpoint,'/execute/sync');const arg=body.args[0];if(body.script==='mobile: deepLink'){assert.equal(arg.package,'com.instagram.android');return;}if(body.script==='mobile: setClipboard'){clipboard=Buffer.from(arg.content,'base64').toString();assert(clipboard.startsWith('studio-receipt:'));sentinel=true;return;}if(body.script==='mobile: getClipboard'){assert(sentinel);return Buffer.from(clipboard).toString('base64');}assert.fail('Unexpected native action');}}};}
test('native Copy link uses a fresh clipboard sentinel, canonicalizes a receipt and rejects stale/foreign links',async()=>{
 const f=receiptFixture('https://www.instagram.com/p/EXACT/?cplk=tracking');assert.equal(await copyNativePostUrl(f.s),'https://www.instagram.com/p/EXACT/');assert.deepEqual(f.calls,['public-share-sheet','copy']);await assert.rejects(copyNativePostUrl(receiptFixture('studio-receipt:unchanged').s),/exact post link/);await assert.rejects(copyNativePostUrl(receiptFixture('https://example.com/p/EXACT/').s),/exact post link/);
 const different=receiptFixture('https://www.instagram.com/p/OTHER/');different.s.until=async()=>true;await assert.rejects(verifyNativePost(different.s,'https://www.instagram.com/p/EXACT/','ours'),/different post/);
});
test('native queue never creates a desktop Instagram page, including timeout cleanup',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mrinal-native-only-'));try{const q=new Queue({page:async()=>assert.fail('Native mode must not create browser pages')},{dataDir:dir,instagramWorker:{checkAccount:async()=>{}},runner:async ctx=>{assert.equal(ctx.page,undefined);return 'dry_run';}});await q.init();const r=await q.start({draft:{selected:['instagram'],captions:{instagram:'Reviewed'},instagram:{postingMethod:'android'}},config:defaults,media:[]});for(let i=0;i<100&&q.processing;i++)await new Promise(r=>setTimeout(r,10));assert.equal(r.items[0].status,'dry_run');}finally{await fs.rm(dir,{recursive:true,force:true});}
});

const postSectionNodes=(handle='ours',caption='Reviewed caption',next='foreign')=>[
 n('row_feed_profile_header','',{bounds:'[0,120][540,198]'}),
 n('row_feed_photo_profile_name',handle,{bounds:'[74,120][474,158]'}),
 n('row_feed_button_share','',{'content-desc':'Send post. Button.',bounds:'[204,856][240,925]'}),
 n('',handle+' '+caption,{bounds:'[18,925][540,981]'}),
 n('row_feed_profile_header','',{bounds:'[0,1028][540,1106]'}),
 n('row_feed_photo_profile_name',next,{bounds:'[74,1028][474,1106]'}),
 n('','ours Wrong next-post caption',{bounds:'[18,1107][540,1130]'}),
 n('row_feed_button_share','',{'content-desc':'Send post. Button.',bounds:'[204,1131][240,1160]'})
];

test('selected public post ownership and caption ignore a partially visible following post',async()=>{
 const nodes=postSectionNodes();assert(nativePostAuthor(nodes,'ours'));
 assert.deepEqual(nativePublishedCaption(nodes,'ours').map(n=>n.caption),['Reviewed caption']);
 const calls=[],s={screen:async()=>nodes,request:async()=>calls.push('unexpected navigation'),click:async()=>calls.push('unexpected click')};
 assert.equal(await verifyNativeViewer(s,'ours','Reviewed caption'),true);assert.deepEqual(calls,[]);
 const ambiguous=[...nodes];ambiguous.splice(2,0,n('row_feed_photo_profile_name','ours',{bounds:'[20,159][200,190]'}));
 assert(!nativePostAuthor(ambiguous,'ours'));await assert.rejects(verifyNativeViewer({...s,screen:async()=>ambiguous},'ours','Reviewed caption'),/author.*ambiguous/);
 const foreign=postSectionNodes('foreign','Reviewed caption','ours');assert(!nativePostAuthor(foreign,'ours'));
 await assert.rejects(verifyNativeViewer({...s,screen:async()=>foreign},'ours','Reviewed caption'),/author/);
});

test('a matching truncated selected caption expands before verification without accepting the next post caption',async()=>{
 let expanded=false;const expected='Reviewed caption with exact line breaks\nSecond line',calls=[];
 const s={screen:async()=>postSectionNodes('ours',expanded?expected:'Reviewed caption\u2026 more'),click:async(using,value)=>{assert.equal(using,'xpath');assert(value.includes('Reviewed caption'));assert(value.includes('more'));expanded=true;calls.push('expand');},until:async predicate=>{const result=await predicate(await s.screen());assert(result);return result;}};
 assert.equal(await verifyNativeViewer(s,'ours',expected),true);assert.deepEqual(calls,['expand']);
 const other={...s,screen:async()=>postSectionNodes('ours','Older caption\u2026 more'),click:async()=>assert.fail('An unrelated prefix should not be expanded')};
 await assert.rejects(verifyNativeViewer(other,'ours',expected),/caption does not match/);
});

test('caption verification rejects duplicate fields within the selected section and preserves stage errors',async()=>{
 const nodes=postSectionNodes();nodes.splice(4,0,n('','ours Another caption',{bounds:'[18,982][540,1000]'}));
 await assert.rejects(verifyNativeViewer({screen:async()=>nodes},'ours','Reviewed caption'),/caption is ambiguous/);
 const s={screen:async()=>postSectionNodes('ours','Reviewed caption\u2026 more'),click:async()=>{},until:async()=>{throw new Error('The selected caption failed to expand.');}};
 await assert.rejects(verifyNativeViewer(s,'ours','Reviewed caption plus remaining text'),/selected caption failed to expand/);
});

test('Copy link targets the selected section share bounds when two post share controls are visible',async()=>{
 let sheet=false,clipboard='',selected=false;
 const s={screen:async()=>sheet?[n('button','',{'content-desc':'Copy link'})]:postSectionNodes(),find:async(using,value)=>{assert.equal(using,'xpath');assert(value.includes('[204,856][240,925]'));assert(!value.includes('[204,1131][240,1160]'));selected=true;return 'selected-share';},until:async predicate=>{const value=await predicate(await s.screen());assert(value);return value;},click:async(using,value)=>{assert(value.includes('Copy link'));assert(selected);clipboard='https://www.instagram.com/p/SELECTED/';sheet=false;},request:async(endpoint,method,body)=>{
  if(endpoint==='/element/selected-share/click'){sheet=true;return;}
  assert.equal(endpoint,'/execute/sync');if(body.script==='mobile: setClipboard'){clipboard=Buffer.from(body.args[0].content,'base64').toString();return;}if(body.script==='mobile: getClipboard')return Buffer.from(clipboard).toString('base64');assert.fail('Unexpected public-viewer operation');
 }};
 assert.equal(await copyNativePostUrl(s),'https://www.instagram.com/p/SELECTED/');
});

test('a scrolled selected post caption stays above the next visible section boundary',()=>{
 const nodes=[n('row_feed_button_share','',{'content-desc':'Send post. Button.',bounds:'[204,120][240,190]'}),n('','ours Reviewed caption',{bounds:'[18,200][540,500]'}),...postSectionNodes('foreign','Other caption')];
 assert.deepEqual(nativePublishedCaption(nodes,'ours').map(n=>n.caption),['Reviewed caption']);
});
