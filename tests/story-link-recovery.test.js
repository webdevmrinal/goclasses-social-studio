// Copyright (c) 2026 Mrinal. Local Story link recovery; no device or publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {addStoryLink} from '../server/automation/native-story.js';
import {nativeId} from '../server/automation/android-native.js';
const options={url:'https://example.org/apply',label:'Application Form',layout:{link:{x:.5,y:.81}}};
const n=(id,text='',extra={})=>({'resource-id':nativeId(id),package:'com.instagram.android',displayed:'true',text,...extra});
async function fixture({lose,applied=true,onManual}={}){
 const base=await sharp({create:{width:360,height:760,channels:3,background:'#171717'}}).png().toBuffer();
 const photo=async center=>sharp(base).composite([{input:await sharp({create:{width:160,height:40,channels:3,background:'#ffffff'}}).png().toBuffer(),left:100,top:Math.round(center-20)}]).png().toBuffer();
 const preview=await photo(370),positioned=await photo(760*.81),calls=[];let stage='story',url='',label='',image=base,lost=false,manual=0;
 const frame=()=>stage==='story'?[n('story_share_controls_action_bar'),n('camera_photo_texture_view','',{bounds:'[0,0][360,760]'})]:stage==='tray'?[n('link_option','',{'content-desc':'Link Sticker'})]:[n('link_sticker_list_web_url_edit_text',url),...(stage==='label'?[n('link_sticker_custom_cta_edit_text',label)]:[])];
 const action=async(name,change)=>{calls.push(name);if(name===lose&&!lost){lost=true;if(applied)change();throw Object.assign(Error('device offline after dispatch'),{code:'ANDROID_ACTION_UNCERTAIN'});}change();};
 const s={signal:new AbortController().signal,screen:async()=>frame(),screenshot:async()=>image,until:async predicate=>{const result=await predicate(frame());if(!result)throw Error('Expected local fixture screen is not ready');return result;},click:async(using,value)=>{assert(!/Your stor|share_shortcut/.test(value));if(value==='asset_button')return action('tray',()=>{stage='tray';});assert.equal(value,'Link Sticker');return action('editor',()=>{stage='editor';});},clickId:async id=>{if(id==='link_sticker_custom_cta_row')return action('custom',()=>{stage='label';});assert.equal(id,'link_sticker_list_done_button');return action('done',()=>{stage='story';image=preview;});},text:async(using,id,value)=>{assert.equal(using,'id');if(id===nativeId('link_sticker_list_web_url_edit_text'))return action('url',()=>{url=value;});assert.equal(id,nativeId('link_sticker_custom_cta_edit_text'));return action('label',()=>{label=value;});},adb:async args=>{assert.deepEqual(args.slice(0,3),['shell','input','swipe']);return action('drag',()=>{image=positioned;});}};
 const controls={get calls(){return calls;},get manual(){return manual;},setUrl(){url=options.url;},setLabel(){stage='label';label=options.label;},finish({withSticker=true}={}){stage='story';image=withSticker?preview:base;},position(){stage='story';image=positioned;}};
 const ctx={intervene:async(details,inspect)=>{manual++;assert(!/tap Your stor|tap Share/.test(details.instructions));return onManual?onManual({details,inspect,controls}):assert.fail('No manual handoff expected');}};
 return {s,ctx,controls};
}
test('Story link normal flow keeps one preparation action per checkpoint and never shares',async()=>{
 const f=await fixture();const result=await addStoryLink(f.s,options,f.ctx);assert.equal(result.url,options.url);assert.equal(result.label,options.label);assert.equal(f.controls.manual,0);assert.deepEqual(f.controls.calls,['tray','editor','url','custom','label','done','drag']);
});
for(const lose of ['tray','editor','url','custom','label','done','drag'])test('lost '+lose+' response continues only after its exact readback, without replay',async()=>{
 const f=await fixture({lose});await addStoryLink(f.s,options,f.ctx);assert.equal(f.controls.manual,0);assert.equal(f.controls.calls.filter(name=>name===lose).length,1);
});
test('unknown URL write asks for reviewed value instead of clearing or typing a second time',async()=>{
 const f=await fixture({lose:'url',applied:false,onManual:async({details,inspect,controls})=>{assert.equal(details.kind,'preparation');assert(details.instructions.includes(options.url));assert.equal(await inspect(),false);controls.setUrl();return inspect();}});await addStoryLink(f.s,options,f.ctx);assert.equal(f.controls.manual,1);assert.equal(f.controls.calls.filter(name=>name==='url').length,1);
});
test('a generic Story screen cannot prove an uncertain sticker creation',async()=>{
 const f=await fixture({lose:'done',applied:false,onManual:async({details,inspect,controls})=>{assert.equal(details.title,'Finish the Story link sticker');controls.finish({withSticker:false});assert.equal(await inspect(),null);controls.finish();return inspect();}});await addStoryLink(f.s,options,f.ctx);assert.equal(f.controls.manual,1);assert.equal(f.controls.calls.filter(name=>name==='done').length,1);
});
test('unknown drag asks for manual positioning and never replays the gesture',async()=>{
 const f=await fixture({lose:'drag',applied:false,onManual:async({details,inspect,controls})=>{assert.equal(details.kind,'placement');assert.equal(await inspect(),null);controls.position();return inspect();}});await addStoryLink(f.s,options,f.ctx);assert.equal(f.controls.manual,1);assert.equal(f.controls.calls.filter(name=>name==='drag').length,1);
});
test('without a queue handoff an uncertain preparation stops without replaying its action',async()=>{
 const f=await fixture({lose:'url',applied:false});await assert.rejects(addStoryLink(f.s,options),/device offline/);assert.equal(f.controls.calls.filter(name=>name==='url').length,1);assert(!f.controls.calls.includes('done'));
});
