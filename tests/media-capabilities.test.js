// Copyright (c) 2026 Mrinal. Attachment routing and selection guard regressions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaKind,mediaSupport,mediaCapabilities,mediaSelectionErrors,defaultMediaFor,isYouTubeShort,mediaPostLabel,UPLOAD_LIMITS} from '../shared/media-capabilities.js';
import {mediaFor,metadataNeedsReview,setTextOnly} from '../shared/media.js';
import {validateDraft} from '../shared/platforms.js';
import {freshDraft} from '../shared/draft.js';
const photo={id:'photo',name:'Poster.png',format:'png',width:1080,height:1080,size:2048};
const video={id:'clip',kind:'video',format:'mp4',name:'Reel.mp4',width:1080,height:1920,durationSeconds:15,size:1024*1024};
const pdf={id:'pdf',kind:'document',format:'pdf',name:'Admissions.pdf',pageCount:10,size:4096};
const destinations=['instagram','linkedin','x','youtubeDA','youtubeCS','whatsapp','telegram','manychat'];
const draftFor=(id,library)=>{const draft=freshDraft();draft.selected=[id];draft.mediaIds=library.map(m=>m.id);draft.captions[id]='Reviewed announcement';return draft;};

test('supported attachment routes distinguish direct uploads from unsupported social formats',()=>{
 for(const id of destinations){assert.equal(mediaSupport(id,photo).supported,id!=='manychat',id+' image');assert.equal(mediaSupport(id,video).supported,id!=='manychat',id+' video');assert.equal(mediaSupport(id,pdf).supported,['linkedin','telegram'].includes(id),id+' PDF');}
 assert.equal(mediaSupport('unknown',pdf).supported,false);assert.equal(mediaSupport('x',{...photo,kind:'audio'}).supported,false);
 assert.match(mediaSupport('whatsapp',pdf).reason,/WhatsApp Channel worker/);assert.match(mediaSupport('x',pdf).reason,/LinkedIn or Telegram/);
});
test('legacy images and inferred MP4/MOV/PDF types retain their correct UI and routing kind',()=>{
 assert.equal(mediaKind(photo),'image');assert.equal(mediaKind({...video,kind:undefined}),'video');assert.equal(mediaKind({format:'mov'}),'video');assert.equal(mediaKind({...pdf,kind:undefined}),'document');assert.equal(mediaKind({kind:'audio'}),'unknown');
 assert.deepEqual(mediaCapabilities('instagram'),{imageMax:10,videoMax:1,documentMax:0});assert.deepEqual(mediaCapabilities('linkedin'),{imageMax:10,videoMax:1,documentMax:1});assert.equal(mediaCapabilities('x').imageMax,4);assert.equal(mediaCapabilities('whatsapp').imageMax,1);assert.equal(mediaCapabilities('manychat').videoMax,0);
});
test('video routing requires verified format, dimensions and duration instead of accepting a renamed image',()=>{
 for(const changes of [{format:'avi'},{durationSeconds:undefined},{durationSeconds:NaN},{durationSeconds:0},{durationSeconds:-1},{width:0},{height:undefined},{height:Infinity}])assert.equal(mediaSupport('instagram',{...video,...changes}).supported,false,JSON.stringify(changes));
 assert.equal(mediaSupport('instagram',{...video,format:'mov'}).supported,true);assert.equal(mediaSupport('telegram',{...video,format:'mov'}).supported,false);assert.match(mediaSupport('telegram',{...video,format:'mov'}).reason,/MP4/);
});
test('X duration boundaries prevent a video that only another destination supports',()=>{
 for(const [durationSeconds,supported]of [[.49,false],[.5,true],[140,true],[140.01,false]])assert.equal(mediaSupport('x',{...video,durationSeconds}).supported,supported,String(durationSeconds));
 assert.equal(mediaSupport('telegram',{...video,durationSeconds:141}).supported,true);assert.equal(mediaSupport('instagram',{...video,durationSeconds:901}).supported,false);
});
test('LinkedIn enforces video duration, dimensions and PDF page boundaries',()=>{
 for(const [durationSeconds,supported]of [[2.9,false],[3,true],[900,true],[901,false]])assert.equal(mediaSupport('linkedin',{...video,durationSeconds}).supported,supported,String(durationSeconds));
 for(const changes of [{width:255},{height:143},{width:4097},{height:4097},{width:256,height:2000},{width:2000,height:144}])assert.equal(mediaSupport('linkedin',{...video,...changes}).supported,false,JSON.stringify(changes));
 assert.equal(mediaSupport('linkedin',{...pdf,pageCount:300}).supported,true);assert.equal(mediaSupport('linkedin',{...pdf,pageCount:301}).supported,false);assert.equal(mediaSupport('telegram',{...pdf,pageCount:301}).supported,true);
});
test('upload size limits are type-specific and WhatsApp applies its stricter worker video cap',()=>{
 assert.equal(mediaSupport('instagram',{...photo,size:UPLOAD_LIMITS.image}).supported,true);assert.equal(mediaSupport('instagram',{...photo,size:UPLOAD_LIMITS.image+1}).supported,false);
 assert.equal(mediaSupport('linkedin',{...pdf,size:UPLOAD_LIMITS.document}).supported,true);assert.equal(mediaSupport('linkedin',{...pdf,size:UPLOAD_LIMITS.document+1}).supported,false);
 assert.equal(mediaSupport('youtubeDA',{...video,size:UPLOAD_LIMITS.video}).supported,true);assert.equal(mediaSupport('youtubeDA',{...video,size:UPLOAD_LIMITS.video+1}).supported,false);
 assert.equal(mediaSupport('whatsapp',{...video,size:64*1024*1024}).supported,true);assert.equal(mediaSupport('whatsapp',{...video,size:64*1024*1024+1}).supported,false);
});
test('one destination cannot combine media types or silently turn several videos or PDFs into an album',()=>{
 assert.match(mediaSelectionErrors('linkedin',[photo,video]).join(' '),/Mixed attachment types/);assert.match(mediaSelectionErrors('telegram',[video,pdf]).join(' '),/Mixed attachment types/);
 assert.match(mediaSelectionErrors('instagram',[video,{...video,id:'clip-2'}]).join(' '),/choose one video/);assert.match(mediaSelectionErrors('linkedin',[pdf,{...pdf,id:'pdf-2'}]).join(' '),/choose one PDF/);
 assert.deepEqual(mediaSelectionErrors('telegram',[pdf]),[]);assert.deepEqual(mediaSelectionErrors('instagram',[video]),[]);
});
test('implicit per-platform selection chooses the first supported coherent group in library order',()=>{
 const second={...photo,id:'photo-2'},library=[pdf,video,photo,second];assert.deepEqual(defaultMediaFor('linkedin',library).map(m=>m.id),['pdf']);assert.deepEqual(defaultMediaFor('x',library).map(m=>m.id),['clip']);assert.deepEqual(defaultMediaFor('telegram',[photo,video,pdf,second]).map(m=>m.id),['photo','photo-2']);
 assert.deepEqual(defaultMediaFor('manychat',library),[]);assert.deepEqual(defaultMediaFor('instagramStory',library),[]);assert.deepEqual(defaultMediaFor('instagram',[pdf]),[]);
 const draft=draftFor('x',library);assert.deepEqual(mediaFor(draft,library,'x').map(m=>m.id),['clip']);draft.mediaByPlatform.x=['photo','pdf'];assert.deepEqual(mediaFor(draft,library,'x').map(m=>m.id),['photo','pdf'],'An explicitly invalid selection is kept for review rather than silently rewritten');assert(validateDraft(draft,library).some(error=>/PDF|Mixed attachment/.test(error)));
});
test('an unsupported-only library cannot silently become an ordinary text post',()=>{
 for(const id of ['x','youtubeDA','youtubeCS','whatsapp']){const draft=draftFor(id,[pdf]);assert.deepEqual(mediaFor(draft,[pdf],id),[]);assert(validateDraft(draft,[pdf]).some(error=>/PDF/.test(error)),id+' blocks omitted unsupported attachment');draft.mediaByPlatform[id]=[];setTextOnly(draft,id,true);assert.deepEqual(validateDraft(draft,[pdf]),[],id+' permits a deliberate text-only selection');}
 const instagram=draftFor('instagram',[pdf]);instagram.mediaByPlatform.instagram=[];assert(validateDraft(instagram,[pdf]).some(error=>/add at least/.test(error)));
});
test('image-only libraries preserve gallery limits and new drafts follow Instagram photo 2',()=>{
 const photos=Array.from({length:11},(_,index)=>({...photo,id:'photo-'+index})),x=draftFor('x',photos.slice(0,5));assert.equal(mediaFor(x,photos.slice(0,5),'x').length,5);assert(validateDraft(x,photos.slice(0,5)).some(error=>/4 images/.test(error)));
 const instagram=draftFor('instagram',photos);assert(validateDraft(instagram,photos).some(error=>/10 images/.test(error)));instagram.mediaIds=photos.slice(0,10).map(m=>m.id);assert.deepEqual(validateDraft(instagram,photos.slice(0,10)),[]);
 assert.deepEqual(mediaFor(draftFor('whatsapp',photos),photos,'whatsapp').map(m=>m.id),['photo-1']);assert.equal(defaultMediaFor('x',photos).length,4);
});
test('image metadata review never labels non-image attachments as clean or asks for image cleaning',()=>{
 const marked={credentials:true,aiMarkers:['origin']},library=[{...photo,metadata:marked},{...video,metadata:marked},{...pdf,metadata:marked}],draft=draftFor('linkedin',library);draft.mediaByPlatform.linkedin=['clip'];assert.deepEqual(metadataNeedsReview(draft,library),[]);draft.mediaByPlatform.linkedin=['pdf'];assert.deepEqual(metadataNeedsReview(draft,library),[]);draft.mediaByPlatform.linkedin=['photo'];assert.deepEqual(metadataNeedsReview(draft,library).map(m=>m.id),['photo']);
});
test('YouTube uses Shorts labels only for qualifying portrait or square video uploads',()=>{
 assert.equal(isYouTubeShort(video),true);assert.equal(isYouTubeShort({...video,width:1920,height:1080}),false);assert.equal(isYouTubeShort({...video,durationSeconds:181}),false);assert.equal(isYouTubeShort(photo),false);assert.equal(mediaPostLabel('instagram',[video]),'Reel');assert.equal(mediaPostLabel('youtubeCS',[video]),'Short');assert.equal(mediaPostLabel('youtubeCS',[{...video,width:1920,height:1080}]),'Video');assert.equal(mediaPostLabel('linkedin',[pdf]),'PDF document');
});
