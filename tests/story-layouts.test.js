// Copyright (c) 2026 Mrinal.
import assert from 'node:assert/strict';import {test} from 'node:test';
import {STORY_PRESETS,storyPresetLayout,selectedStoryPreset} from '../shared/story-layouts.js';
import {nativeStoryTarget} from '../server/automation/native-repost.js';
import {platformPostPreview} from '../client/platform-previews.js';
import {DEFAULT_STORY_LAYOUT,storyLayout} from '../shared/instagram.js';
test('eight distinct Story presets plus a persistent custom state',()=>{assert.equal(STORY_PRESETS.length,8);assert.equal(new Set(STORY_PRESETS.map(p=>p.id)).size,8);assert.equal(selectedStoryPreset({}), 'signature');assert.equal(selectedStoryPreset({layout:structuredClone(DEFAULT_STORY_LAYOUT),layoutPreset:'custom'}),'custom');assert.equal(selectedStoryPreset({layout:{card:{x:.4}}}),'custom');assert.throws(()=>storyPresetLayout('unknown'));assert.equal(new Set(STORY_PRESETS.map(p=>JSON.stringify(storyPresetLayout(p.id)))).size,8);});
for(const imageAspect of [.8,1,1.5,2])for(const hasLink of [true,false])test('preset safe areas, image ratio '+imageAspect+', link '+hasLink,()=>{
 for(const p of STORY_PRESETS){const l=storyPresetLayout(p.id,{hasLink,imageAspect,chromeHeight:.12});assert.deepEqual(storyLayout(l),l);const h=l.card.width*9/16/imageAspect+.12;assert(l.card.y-h/2>=.12-1e-9,p.id+' header clearance');assert(l.card.y+h/2<=(hasLink?l.link.y-.085:.9)+1e-9,p.id+' footer/link clearance');assert(l.card.x-l.card.width/2>=.02-1e-9);assert(l.card.x+l.card.width/2<=.98+1e-9);assert.equal(l.link.width,.66,'Native sticker size remains unchanged');const canvas={x:0,y:0,width:900,height:1600};assert.doesNotThrow(()=>nativeStoryTarget(canvas,l,{x:0,y:0,width:900*l.card.width,height:1600*h},{hasLink}),p.id+' passes the real native placement check');}
});
test('over-tall image fails clearly rather than silently showing another preset',()=>{assert.throws(()=>storyPresetLayout('gallery',{imageAspect:.2}),/too tall/);});

test('preview keeps text literal and never makes invalid DM URLs executable',()=>{const html=platformPostPreview({id:'manychat',account:'GO',caption:'<script>alert(1)</script>',links:[{label:'<Apply>',url:'javascript:alert(1)'},{label:'Details',url:'https://example.com/apply'}]});assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('href=\"javascript:'));assert(html.includes('aria-disabled=\"true\"'));assert(html.includes('href=\"https://example.com/apply\"'));});
