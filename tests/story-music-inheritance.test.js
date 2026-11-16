import test from 'node:test';import assert from 'node:assert/strict';
import {InstagramAndroidWorker} from '../server/automation/instagram-android.js';
import {nativeId} from '../server/automation/android-native.js';
const url='https://www.instagram.com/p/SAME_POST/',music={key:'1234567890',title:'LOADED',artist:'Beast Inside Beats'},proof={postUrl:url,music:{...music,segmentStart:'129500.0',durationSeconds:30},verifiedBy:'existing_post_saved_audio'};
const node=id=>({'resource-id':nativeId(id),package:'com.instagram.android',displayed:'true'});
const scene=()=>[node('story_share_controls_action_bar'),node('camera_photo_texture_view')];
test('sharing a confirmed musical feed post keeps inherited audio without opening any music control',async()=>{
 const worker=new InstagramAndroidWorker({dataDir:'.'}),s={screen:async()=>scene(),click:()=>assert.fail('Do not open Music'),request:()=>assert.fail('No extra native command'),until:()=>assert.fail('No library wait')};
 const audio=await worker.inheritPostMusic(s,music,proof,url);assert.equal(audio.key,music.key);assert.equal(audio.verifiedBy,'confirmed_feed_audio_inheritance');assert(audio.inherited&&audio.sourceVerified);
 assert.equal(audio.segmentStart,undefined);assert.equal(audio.durationSeconds,undefined);
});
test('another post, another requested song or missing proof cannot be treated as inherited audio',async()=>{
 const worker=new InstagramAndroidWorker({dataDir:'.'}),s={screen:()=>assert.fail('No false inheritance')};
 for(const source of [undefined,{...proof,postUrl:'https://www.instagram.com/p/OTHER/'},{...proof,music:{...music,key:'9999999999'}},{...proof,music:{...music,title:'Another song'}}])assert.equal(await worker.inheritPostMusic(s,music,source,url),null);
});
test('an open library, changed editor or protected screen does not bypass Story review',async()=>{
 const worker=new InstagramAndroidWorker({dataDir:'.'});
 for(const nodes of [[],[...scene(),node('music_browser_container')],[...scene(),node('link_sticker_list_web_url_edit_text')],[...scene(),{...node('password'),password:'true'}]])await assert.rejects(worker.inheritPostMusic({screen:async()=>nodes},music,proof,url),/Story editor/);
});
