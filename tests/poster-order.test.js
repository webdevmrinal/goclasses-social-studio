import test from 'node:test';import assert from 'node:assert/strict';import {orderPosterFiles} from '../shared/poster-order.js';import {mediaFor} from '../shared/media.js';
test('explicit poster prefixes place the cover first with numeric slide order',()=>{
 const files=['10_slide_topic.png','02_slide_topic.png','01_cover_topic.png'].map(name=>({name}));assert.deepEqual(orderPosterFiles(files).map(f=>f.name),['01_cover_topic.png','02_slide_topic.png','10_slide_topic.png']);assert.equal(files[0].name,'10_slide_topic.png');
 const old=['slide_2_topic.png','cover_topic.png','slide_1_topic.png'].map(originalname=>({originalname}));assert.equal(orderPosterFiles(old)[0].originalname,'cover_topic.png');
});
test('ambiguous names, partial batches and duplicate ordinals preserve the supplied order',()=>{
 for(const names of [['Poster-2.png','Poster-1.png'],['01_cover_topic.png','random.png'],['01_cover_a.png','01_cover_b.png'],['02_slide_topic.png','01_slide_topic.png']]){const files=names.map(name=>({name}));assert.deepEqual(orderPosterFiles(files),files);}
});
test('X and both YouTube defaults follow Instagram while explicit per-social order stays editable',()=>{
 const media=[{id:'a',kind:'image'},{id:'b',kind:'image'}],draft={mediaIds:['a','b'],mediaByPlatform:{instagram:['b','a']}};
 for(const id of ['x','youtubeDA','youtubeCS']){assert.deepEqual(mediaFor(draft,media,id).map(m=>m.id),['b','a']);draft.mediaByPlatform[id]=['a','b'];assert.deepEqual(mediaFor(draft,media,id).map(m=>m.id),['a','b']);}
});
