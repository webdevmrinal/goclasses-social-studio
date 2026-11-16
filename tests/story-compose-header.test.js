import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {instagramOwnStoryIdentity,instagramStoryAgeSeconds} from '../shared/instagram-story-viewer.js';
import {ownStoryViewer,storyPreviewPixels,verifyOwnPublishedStory} from '../server/automation/native-story-readback.js';
const node=(id,attrs={})=>({'resource-id':'com.instagram.android:id/'+id,package:'com.instagram.android',displayed:'true',text:'',...attrs});
const viewer=(handle='ours',age='5 seconds ago')=>[
 node('reel_viewer_root'),node('self_toolbar_menu_button'),node('viewers_facepile_label',{text:'Activity'}),
 node('reel_viewer_text_container',{'content-desc':handle+"'s story, "+age,bounds:'[12,10][100,40]'}),
 node('reel_viewer_title_row_compose',{bounds:'[12,10][70,20]'}),
 node('',{text:handle,bounds:'[14,11][40,19]'}),node('reel_viewer_media_container',{bounds:'[0,0][100,200]'})
];
test('current Compose header identifies only the configured own Story',()=>{
 assert.equal(instagramOwnStoryIdentity(viewer(),'ours')?.header,'compose');assert(ownStoryViewer(viewer(),'ours'));
 assert(!ownStoryViewer(viewer('other'),'ours'));
 for(const id of ['reel_viewer_root','self_toolbar_menu_button','viewers_facepile_label','reel_viewer_title_row_compose'])assert(!ownStoryViewer(viewer().filter(n=>!n['resource-id'].endsWith('/'+id)),'ours'));
 assert(!ownStoryViewer([...viewer(),node('reel_viewer_text_container')],'ours'));
 const changed=viewer();changed[5].text='other';assert(!ownStoryViewer(changed,'ours'));
 assert(!ownStoryViewer(viewer('ours','unknown age'),'ours'));
 for(const id of ['direct_private_share_container_view','direct_external_share_container_view','music_editor_controls_container','story_share_controls_action_bar'])assert(!ownStoryViewer([...viewer(),node(id)],'ours'));
});
test('current timestamps retain freshness checks across native header formats',()=>{
 for(const [text,expected] of [['just now',0],['5 seconds ago',5],['1 minute ago',60],['21 hours ago',75600],['2 days ago',172800],['4m',240]])assert.equal(instagramStoryAgeSeconds(text),expected);
 assert.equal(instagramStoryAgeSeconds('yesterday'),null);
});
test('a current published Story still requires matching reviewed pixels',async()=>{
 const png=await sharp({create:{width:100,height:200,channels:3,background:'#ac8171'}}).png().toBuffer();
 const preview=await storyPreviewPixels(png,{x:0,y:0,width:100,height:200});
 const s={screen:async()=>viewer(),screenshot:async()=>png,clickId:()=>assert.fail('No publishing'),account:()=>assert.fail('Already own viewer'),gesture:()=>assert.fail('Already matched')};
 assert.equal((await verifyOwnPublishedStory(s,{handle:'ours',preview,submittedAt:Date.now()})).verifiedBy,'native_own_story_preview');
 s.screen=async()=>viewer('ours','21 hours ago');s.screenshot=()=>assert.fail('An old Story is not proof');
 await assert.rejects(verifyOwnPublishedStory(s,{handle:'ours',preview,submittedAt:Date.now(),maxStories:1}),/could not be matched/);
});
