// Copyright (c) 2026 Mrinal. Native publication receipts; every screen/control is simulated.
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {nativeId} from '../server/automation/android-native.js';
import {nativeInstagramPublication,nativeInstagramBaseline} from '../server/automation/native-reference.js';
const n=(id,text='',extra={})=>({'resource-id':id?nativeId(id):'',package:'com.instagram.android',displayed:'true',text,...extra});
const url=id=>'https://www.instagram.com/p/'+id+'/';
function fixture({fresh=true,caption='Reviewed caption',author='ours',current=false,stale=false,secondFresh=false,duplicateAuthor=false}={}){
 const old=['PIN1','PIN2','PIN3','OLD1','OLD2','OLD3'];let tiles=fresh?[...old.slice(0,3),'NEW',...old.slice(3)]:[...old];
 if(secondFresh)tiles=['PIN1','PIN2','NEW2','NEW','OLD1','OLD2'];
 let location=current?'post':'review-finished',post=current?'NEW':'',sheet=false,clipboard='',copies=0,expanded=false,refreshes=0;
 const calls=[],diagnostics=[];
 const viewedCaption=()=>post==='NEW'||post==='NEW2'?caption:'Older caption';
 const screen=()=>location==='profile'?[n('action_bar_title','ours'),n('profile_tab_layout'),n('profile_header_familiar_post_count_value',String(tiles.length)),...(stale&&!refreshes?old:tiles).slice(0,6).map((id,i)=>n('image_button','',{'content-desc':'Photo by Ours at Row '+(Math.floor(i/3)+1)+', Column '+(i%3+1),bounds:'['+(i%3*160)+','+(300+Math.floor(i/3)*200)+']['+(i%3*160+158)+','+(498+Math.floor(i/3)*200)+']'}))]:location==='post'?(sheet?[n('button','',{'content-desc':'Copy link'})]:[
  n('row_feed_profile_header','',{bounds:'[0,100][540,180]'}),n('row_feed_photo_profile_name',post==='NEW'||post==='NEW2'?author:'ours',{bounds:'[74,100][474,158]'}),
  ...(duplicateAuthor?[n('row_feed_photo_profile_name','foreign',{bounds:'[74,159][474,180]'})]:[]),
  n('row_feed_button_share','',{'content-desc':'Send post. Button.',bounds:'[204,700][240,760]'}),
  n('','ours '+(expanded?viewedCaption():viewedCaption()),{bounds:'[18,800][540,900]'}),
  n('row_feed_profile_header','',{bounds:'[0,1000][540,1080]'}),n('row_feed_photo_profile_name','foreign',{bounds:'[74,1000][474,1080]'}),n('','ours Wrong next-post caption',{bounds:'[18,1081][540,1130]'})
 ]):[];
 const s={screen:async()=>screen(),screenshot:async()=>sharp({create:{width:540,height:1170,channels:3,background:'#123456'}}).png().toBuffer(),account:async handle=>{assert.equal(handle,'ours');location='profile';},until:async predicate=>{const value=await predicate(screen());assert(value,'Native fixture predicate must match its current surface');return value;},find:async()=>{assert.equal(location,'post');return 'public-share';},click:async(using,value)=>{
  if(value.includes('image_button')){const m=value.match(/Row (\d+), Column (\d+)/);assert(m);post=(stale&&!refreshes?old:tiles)[(+m[1]-1)*3+(+m[2]-1)];location='post';expanded=false;calls.push('open:'+post);}
  else if(value.includes('Copy link')){assert(sheet);clipboard=url(post);sheet=false;copies++;calls.push('copy:'+post);}
  else if(value.includes('@text=')){expanded=true;calls.push('expand:'+post);}
  else assert.fail('Unexpected native click');
 },request:async(endpoint,method,body)=>{
  if(endpoint==='/back'){assert.equal(location,'post');if(sheet)sheet=false;else location='profile';calls.push('back');return;}
  if(endpoint.includes('/click')){assert.equal(location,'post');sheet=true;calls.push('sheet:'+post);return;}
  assert.equal(endpoint,'/execute/sync');const arg=body.args[0];
  if(body.script==='mobile: deepLink'){calls.push('deepLink:'+arg.url);if(arg.url==='https://www.instagram.com/ours/')location='profile';else{post=arg.url.match(/\/p\/([^/]+)/)[1];location='post';}return;}
  if(body.script==='mobile: scrollGesture'){assert.equal(location,'profile','Caption mismatches should be rejected before scrolling old posts');assert.equal(arg.direction,'up');refreshes++;calls.push('refresh');return;}
  if(body.script==='mobile: setClipboard'){clipboard=Buffer.from(arg.content,'base64').toString();return;}
  if(body.script==='mobile: getClipboard')return Buffer.from(clipboard).toString('base64');assert.fail('Unexpected native command');
 }};
 return {s,baseline:old.map(url),calls,diagnostics,onDiagnostic:async value=>diagnostics.push(value),copies:()=>copies,refreshes:()=>refreshes};
}

test('profile confirmation skips nonmatching pinned posts and copies only the exact fresh candidate once',async()=>{
 const f=fixture(),proof=await nativeInstagramPublication(f.s,'ours',f.baseline,'Reviewed caption',f.onDiagnostic);
 assert.equal(proof.postUrl,url('NEW'));assert.deepEqual(proof.candidates,[url('NEW')]);assert.equal(f.copies(),1);
 assert.deepEqual(f.calls.filter(c=>c.startsWith('copy:')),['copy:NEW']);assert.equal(f.calls.filter(c=>c.startsWith('deepLink:')).length,1);
 assert.equal(f.diagnostics.at(-1).phase,'confirmed');assert.equal(f.diagnostics.at(-1).inspected,4);
 assert(!JSON.stringify(f.diagnostics).includes('Reviewed caption'));assert(!JSON.stringify(f.diagnostics).includes('Older caption'));
});

test('a matching post already visible after Share confirms directly with one copy and no profile navigation',async()=>{
 const f=fixture({current:true}),proof=await nativeInstagramPublication(f.s,'ours',f.baseline,'Reviewed caption',f.onDiagnostic);
 assert.equal(proof.postUrl,url('NEW'));assert.equal(f.copies(),1);assert(!f.calls.some(c=>c.startsWith('deepLink:')||c==='refresh'||c==='back'));
 assert.equal(f.diagnostics[0].phase,'current_post');assert.equal(f.diagnostics.at(-1).phase,'confirmed');assert.equal(f.diagnostics.at(-1).passes,0);
});

test('an already-visible baseline post is never called new and matching old captions remain excluded',async()=>{
 const f=fixture({current:true});
 await assert.rejects(nativeInstagramPublication(f.s,'ours',[...f.baseline,url('NEW')],'Reviewed caption',f.onDiagnostic),/new Instagram post is not visible/);
 assert.equal(f.refreshes(),2);assert.equal(f.diagnostics.at(-1).failure,'no_verified_new_post');assert.deepEqual(f.diagnostics.at(-1).candidates,[]);
 assert(f.diagnostics.at(-1).rejected.some(r=>r.reason==='previous_post'));assert(f.diagnostics.at(-1).rejected.length<=12);
});

test('one bounded profile refresh discovers a fresh post hidden by a stale first grid',async()=>{
 const f=fixture({stale:true}),proof=await nativeInstagramPublication(f.s,'ours',f.baseline,'Reviewed caption',f.onDiagnostic);
 assert.equal(proof.postUrl,url('NEW'));assert.equal(f.copies(),1);assert.equal(f.refreshes(),2);
 assert.equal(f.diagnostics.at(-1).passes,2);assert.equal(f.diagnostics.at(-1).inspected,8);
});

test('multiple fresh exact matches remain ambiguous instead of selecting the first matching caption',async()=>{
 const f=fixture({secondFresh:true});await assert.rejects(nativeInstagramPublication(f.s,'ours',f.baseline,'Reviewed caption',f.onDiagnostic),/More than one new Instagram post/);
 assert.equal(f.copies(),2);assert.equal(f.diagnostics.at(-1).failure,'multiple_new_matches');assert.equal(f.refreshes(),0);
});

test('changed captions, foreign owners and ambiguous current identities never produce a receipt or copied link',async()=>{
 for(const options of [{fresh:false},{caption:'Changed caption'},{author:'foreign'},{duplicateAuthor:true}]){
  const f=fixture(options);await assert.rejects(nativeInstagramPublication(f.s,'ours',f.baseline,'Reviewed caption',f.onDiagnostic),/new Instagram post is not visible/);
  assert.equal(f.copies(),0);assert.equal(f.refreshes(),2);assert.equal(f.diagnostics.at(-1).passes,2);assert(f.diagnostics.at(-1).inspected<=8);
 }
});

test('native baseline still reads six distinct recent links and returns to account verification',async()=>{
 const f=fixture({fresh:false});assert.deepEqual(await nativeInstagramBaseline(f.s,'ours'),f.baseline);assert.equal(f.copies(),6);
});


test('viewer transport and stage failures propagate without trying more posts or hiding their cause',async()=>{
 const f=fixture(),screen=f.s.screen,original=new Error('The selected public viewer disconnected.');
 f.s.screen=async()=>{const nodes=await screen();if(nodes.some(n=>n['resource-id']===nativeId('row_feed_profile_header')))throw original;return nodes;};
 await assert.rejects(nativeInstagramPublication(f.s,'ours',f.baseline,'Reviewed caption',f.onDiagnostic),error=>error===original);
 assert.equal(f.copies(),0);assert.equal(f.refreshes(),0);assert.equal(f.diagnostics.at(-1).phase,'failed');assert.equal(f.diagnostics.at(-1).failure,'inspection_failed');
 assert.equal(f.calls.filter(c=>c.startsWith('open:')).length,1);
});
