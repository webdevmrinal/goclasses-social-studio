// Copyright (c) 2026 Mrinal. All rights reserved.
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {AndroidSession,nativeId} from './android-native.js';
import {openRepost,placeRepost,stashRepost,restoreRepost} from './native-repost.js';
import {addStoryLink,prepareStoryAudience,storyAudienceEvidence,discardStory} from './native-story.js';
import {musicResults,musicPage,scrollMusicPage,revealMusicResult,musicPlayback,setMusicPlayback,searchMusic,applyTrack,openMusicLibrary,openStoryMusicLibrary,nativeCaption,verifyNativeCaption,discardPost} from './native-music.js';
import {pushAlbum,removeAlbum,openGallery,selectAlbumPhotos,photoEvidence} from './native-photos.js';
import {instagramBaseline,instagramPublication,instagramCaptionMatches} from './instagram-reference.js';
import {instagramPostUrl} from '../../shared/manychat.js';
import {instagramOptions,instagramMusicEnabled} from '../../shared/instagram.js';
import {atomicWrite,readJson} from '../config.js';
import {finishPost,InterventionError} from './utils.js';

export class InstagramAndroidWorker {
  constructor({dataDir,sessionFactory=options=>new AndroidSession(options)}){
    this.dataDir=dataDir;this.sessionFactory=sessionFactory;this.busy=false;this.selections=[];this.operation=false;
  }
  async init(){this.selections=await readJson(path.join(this.dataDir,'instagram-music.json'),[]);}
  selection(value,handle){
    const chosen=this.selections.find(v=>v.id===value?.id&&v.account===handle);
    if(!chosen)throw new Error('Choose the Instagram song again from this music picker.');
    return structuredClone(chosen);
  }
  async open(config,signal,onProgress){
    if(this.busy)throw new InterventionError('Finish choosing Instagram music before starting a run.');
    this.busy=true;
    try{this.s=this.sessionFactory({signal});await this.s.open({start:true});this.s.onUnresponsive=onProgress||((message)=>this.progress(message));await this.s.account(config.platforms.instagram.handle);return this.s;}
    catch(e){await this.close();throw e;}
  }
  async close(){
    clearTimeout(this.timer);
    try{await this.s?.close();}finally{this.s=null;this.busy=false;this.picker=null;this.operation=false;this.progressState=null;this.handoff=null;this.preflight=null;}
  }
  async closePicker(){if(!this.picker)return;if(this.picker.album){await discardPost(this.s,'');await removeAlbum(this.s,this.picker.album);}else if(this.picker.owned)await discardPost(this.s,'');}
  expirePicker(){clearTimeout(this.timer);this.timer=setTimeout(()=>{if(this.operation)this.expirePicker();else this.cancelPicker().catch(()=>{});},5*60*1000);this.timer.unref();}
  progress(message,phase='working',working=true){this.progressState={picker:true,message,phase,working,at:new Date().toISOString()};this.onProgress?.();}
  pickerState(){return {results:this.picker.results,hasMore:this.picker.hasMore!==false,playback:this.picker.playback||null};}
  mergeSongs(rows){for(const row of rows){const i=this.picker.results.findIndex(song=>song.key===row.key);if(i<0)this.picker.results.push(row);else this.picker.results[i]=row;}this.picker.results.sort((a,b)=>Number(a.selector.match(/^audio_browser_track_(\d+)_/)?.[1])-Number(b.selector.match(/^audio_browser_track_(\d+)_/)?.[1]));}
  async startPicker(config,files){
    if(!Array.isArray(files)||!files.length)throw new Error('Upload the Instagram images before choosing a song.');
    this.opening=true;this.progress('Connecting to Android and checking the account...');
    try{await this.open(config);}catch(e){this.opening=false;throw e;}
    try{
      this.picker={account:config.platforms.instagram.handle,query:'',results:[],owned:false,hasMore:true,playback:null};
      this.progress('Copying and verifying your uploaded images...');
      this.picker.album=await pushAlbum(this.s,files);this.s.uploadAlbum=this.picker.album;
      this.progress('Opening your images in Instagram...');
      await openGallery(this.s,this.picker.album.folder);this.picker.owned=true;
      this.progress('Selecting and verifying your uploaded images...');
      await selectAlbumPhotos(this.s,this.picker.album);
      this.progress('Loading Instagram music recommendations for this post...');
      this.picker.results=await openMusicLibrary(this.s);
      this.progress('Recommendations ready','ready',false);this.expirePicker();
      return this.pickerState();
    }catch(e){await this.closePicker().catch(()=>{});await this.close();throw e;}finally{this.opening=false;}
  }
  async query(query){
    if(this.opening||!this.picker||this.operation)throw new Error('Open the music picker again.');
    if(typeof query!=='string'||query.trim().length<2||query.length>100)throw new Error('Search with 2-100 characters.');
    this.operation=true;this.progress('Searching Instagram...','searching');
    try{this.expirePicker();if(this.picker.playback)await setMusicPlayback(this.s,this.picker.playback,false);this.picker.query=query.trim();this.picker.results=await searchMusic(this.s,this.picker.query);this.picker.hasMore=Boolean(this.picker.results.length);this.picker.playback=null;this.progress('Search ready','ready',false);return this.pickerState();}
    catch(e){this.progress(e.message,'error',false);throw e;}finally{this.operation=false;}
  }
  async more(){
    if(this.opening||!this.picker||this.operation)throw new Error('Wait for the current music operation.');
    this.operation=true;this.expirePicker();this.progress('Loading more songs from Instagram...','loading');
    try{
      const ordinal=track=>Number(track?.selector?.match(/^audio_browser_track_(\d+)_/)?.[1]||0),anchor=this.picker.results.reduce((a,b)=>ordinal(a)>ordinal(b)?a:b,null);
      if(anchor)await revealMusicResult(this.s,anchor,rows=>this.mergeSongs(rows));
      let changed=true;
      for(let i=0;i<2&&changed;i++){const before=(await musicPage(this.s)).map(r=>r.key).join(','),rows=await scrollMusicPage(this.s);this.mergeSongs(rows);changed=rows.map(r=>r.key).join(',')!==before;}
      this.picker.hasMore=changed;this.progress('Songs loaded','ready',false);return this.pickerState();
    }catch(e){this.progress(e.message,'error',false);throw e;}finally{this.operation=false;}
  }
  async preview(key){
    if(this.opening||!this.picker||this.operation)throw new Error('Wait for the current music operation.');
    this.operation=true;this.expirePicker();this.progress('Opening the audio preview...','previewing');
    try{
      const result=this.picker.results.find(r=>r.key===key);if(!result)throw new Error('Search for that song again.');
      if(musicPlayback(await this.s.screen(),result)===null){
        const current=await revealMusicResult(this.s,result,rows=>this.mergeSongs(rows));await this.s.click('id',current.selector);
        await this.s.until(nodes=>musicPlayback(nodes,result)!==null,'The audio preview did not load.');
      }
      this.picker.playback=await setMusicPlayback(this.s,result,true);this.progress('Playing on the worker PC','playing',false);return {...this.pickerState(),playing:key};
    }catch(e){this.progress(e.message,'error',false);throw e;}finally{this.operation=false;}
  }
  async pause(){
    if(this.opening||!this.picker||this.operation)throw new Error('Wait for the current music operation.');
    if(!this.picker.playback)throw new Error('Preview a song first.');
    this.operation=true;this.expirePicker();this.progress('Pausing the audio preview...','pausing');
    try{this.picker.playback=await setMusicPlayback(this.s,this.picker.playback,false);this.progress('Preview paused','paused',false);return this.pickerState();}
    catch(e){this.progress(e.message,'error',false);throw e;}finally{this.operation=false;}
  }
  async choose(key){
    if(this.opening||!this.picker||this.operation)throw new Error('Open the music picker again.');
    this.operation=true;
    try{
      this.progress('Confirming your song and closing the native draft...','selecting');
      const result=this.picker.results.find(r=>r.key===key);if(!result)throw new Error('Search for that song again.');
      await revealMusicResult(this.s,result,rows=>this.mergeSongs(rows));
      const selection={...result,id:randomUUID(),account:this.picker.account,query:result.title.slice(0,100),durationSeconds:30,createdAt:new Date().toISOString()};
      delete selection.selector;this.selections.push(selection);
      await atomicWrite(path.join(this.dataDir,'instagram-music.json'),this.selections);
      await this.closePicker();await this.close();return {selection};
    }catch(e){this.operation=false;this.progress(e.message,'error',false);throw e;}
  }
  async cancelPicker(){if(this.opening)throw new Error('Wait for the Instagram library to open, then close it.');if(this.operation)throw new Error('Wait for the current music search to finish.');this.progress('Closing the music picker...','closing');try{await this.closePicker();}finally{await this.close();}}
  async applyStoryMusic(s,music){
    await openStoryMusicLibrary(s);
    await searchMusic(s,music.query);
    const match=await revealMusicResult(s,music);
    if(!match)throw new InterventionError('The reviewed song is not available for this Story. Nothing was shared.');
    await s.click('id',match.selector);
    await s.until(n=>n.some(x=>x['resource-id']==='audio_bar_select_tap_target'&&x['content-desc']==='Select track '+music.title+' by '+music.artist),'The music preview differs from the selected song.');
    await s.click('id','audio_bar_select_tap_target');
    const nodes=await s.until(n=>n.some(x=>x['resource-id']===nativeId('music_editor_done_button'))&&n,'Story music clip did not load.');
    const segment=nodes.find(n=>n.tag==='android.widget.SeekBar')?.text;
    if(!/^\d+(?:\.\d+)?$/.test(segment||''))throw new InterventionError('The Story audio clip could not be verified.');
    await s.click('accessibility id','Music Only');
    await s.clickId('music_editor_done_button');
    await s.until(n=>n.some(x=>x['resource-id']===nativeId('story_share_controls_action_bar'))&&!n.some(x=>x['resource-id']===nativeId('music_editor_done_button')&&x.displayed==='true'),'Story music did not return to the editor.');
    return {key:music.key,title:music.title,artist:music.artist,segmentStart:segment,style:'Music Only'};
  }
  async openForRun(ctx){
    if(!this.preflight)return this.open(ctx.config,ctx.signal,ctx.step);
    const held=this.preflight;this.preflight=null;
    if(!this.s||held.runId!==ctx.runId||held.account!==ctx.config.platforms.instagram.handle){await this.close();throw new InterventionError('The Android preflight changed. Review this run before retrying.');}
    this.s.signal=ctx.signal;this.s.onUnresponsive=ctx.step;
    // Verify the account and absence of user drafts again; reuse only the
    // expensive driver connection, never a stale UI/account assertion.
    try{await this.s.account(held.account);return this.s;}catch(error){await this.close();throw error;}
  }
  async openStory(ctx,url){
    if(!this.handoff)return this.openForRun(ctx);
    const held=this.handoff;
    if(!this.s||held.runId!==ctx.runId||held.postUrl!==url||held.account!==ctx.config.platforms.instagram.handle){
      await this.close();throw new InterventionError('The confirmed Instagram feed handoff changed. Retry only the Story from its exact post URL.');
    }
    this.handoff=null;this.s.signal=ctx.signal;this.s.onUnresponsive=ctx.step;
    return this.s;
  }
  retainForStory(ctx,status,publication){
    const postUrl=instagramPostUrl(publication?.postUrl);
    if(status!=='posted'||!ctx.continueInstagramStory||!ctx.runId||!postUrl||ctx.signal?.aborted)return false;
    this.handoff={runId:ctx.runId,postUrl,account:ctx.config.platforms.instagram.handle};return true;
  }
  async checkAccount(config,{runId,onProgress}={}){
    let retained=false;
    try{await this.open(config,undefined,onProgress);if(runId){this.preflight={runId,account:config.platforms.instagram.handle};retained=true;}}
    finally{if(!retained)await this.close();}
  }
  async run(ctx){
    const options=instagramOptions(ctx.instagram),music=instagramMusicEnabled(options,ctx.id)?this.selection(options.music.selection,ctx.config.platforms.instagram.handle):null;
    let url;
    if(ctx.id==='instagramStory'){
      let source=options.story.sourcePostUrl||ctx.instagramPublication?.postUrl;
      if(!source&&ctx.mode==='TEST')source=(await instagramBaseline(ctx.page.context(),ctx.config.platforms.instagram.handle))[0];
      url=instagramPostUrl(source);
      if(!url)throw new InterventionError('The exact feed-post permalink is not confirmed. Enter its URL or verify the feed result before retrying only this Story.');
      // The retained session comes only from this run's confirmed native feed.
      // Standalone Story retries still verify ownership through the exact permalink.
      if(!this.handoff){await ctx.step('Verifying the exact feed post for the Android Story...');await this.verifyPost(ctx.page,url,ctx.config.platforms.instagram.handle);}
    }
    await ctx.step(this.handoff?'Continuing from the confirmed Android feed post...':'Checking the dedicated Android Instagram account...');
    const s=ctx.id==='instagramStory'?await this.openStory(ctx,url):await this.openForRun(ctx);
    let submitted=false,album,owned=false,retained=false;
    const snapshot=async label=>{
      const nodes=await s.screen();
      if(nodes.some(n=>/direct_external_share_container_view|direct_share_sheet_grid_view_pog|thread_list_recycler_view/.test(n['resource-id']||'')))return;
      const known=nodes.some(n=>n.displayed==='true'&&/share_footer_button|story_share_controls_action_bar|share_story_button|media_thumbnail_tray_button|music_editor_done_button|link_sticker_list_web_url_edit_text/.test(n['resource-id']||''));
      const albumOnly=album&&nodes.some(n=>n['resource-id']===nativeId('gallery_folder_menu_tv')&&n.text===album.folder);
      if(!known&&!albumOnly)return;
      await ctx.snapshot(label,{nativeImage:await s.screenshot()});
    };
    try{
      if(ctx.id==='instagramStory'){
        await ctx.step('Opening the exact feed post as a Story...');
        await openRepost(s,url);owned=true;
        await ctx.step('Applying the reviewed shared-post card layout...');
        await placeRepost(s,options.story.layout,{hasLink:options.story.linkEnabled});
        let audio=null;
        if(music){await ctx.step('Adding the selected Story music...');audio=await this.applyStoryMusic(s,music);}
        if(options.story.linkEnabled){
          await ctx.step('Placing the reviewed Story link...');
          const stash=await stashRepost(s);await addStoryLink(s,options.story);await restoreRepost(s,stash,options.story.layout);
        }
        const evidence=await prepareStoryAudience(s);
        await ctx.recordPreparation({kind:'instagramStory',audience:evidence.destinations,testExistingPost:ctx.mode==='TEST',postUrl:url,music:audio,story:options.story});
        await snapshot('story-preview');
        const status=await finishPost({...ctx,snapshot,
          preflight:async()=>{ctx.signal?.throwIfAborted();if(JSON.stringify(await storyAudienceEvidence(s))!==JSON.stringify(evidence))throw new InterventionError('The reviewed Story changed. Nothing was shared.');},
          publish:async()=>{submitted=true;const id=await s.find('id',nativeId('share_story_button'));await s.request('/element/'+id+'/click','POST',{});},
          verify:async()=>{await s.until(n=>n.some(x=>/^(Your story has been shared|Added to your story|Story shared)$/i.test(x.text||'')),'Story submission began. Check Instagram before retrying; no duplicate send was attempted.',30000);}
        });
        if(status==='dry_run')await discardStory(s);
        return {status};
      }
      const baseline=ctx.mode==='LIVE'?await instagramBaseline(ctx.page.context(),ctx.config.platforms.instagram.handle):null;
      await ctx.step('Transferring and verifying the reviewed Android image copies...');
      album=await pushAlbum(s,ctx.files);s.uploadAlbum=album;
      await ctx.step('Opening the isolated upload album and checking limited photo access...');
      await openGallery(s,album.folder);owned=true;
      await ctx.step('Selecting the reviewed images and waiting for Instagram to decode them...');
      await selectAlbumPhotos(s,album);
      let clip;
      if(music){
        await ctx.step('Loading Instagram music for the reviewed images...');await openMusicLibrary(s);
        await ctx.step('Finding the exact selected song: '+music.title+'...');await searchMusic(s,music.query);
        await ctx.step('Applying and verifying the selected audio clip...');clip=await applyTrack(s,music,music.durationSeconds);
      }
      await ctx.step('Verifying the native caption and images'+(music?' with music':'')+'...');
      await nativeCaption(s,ctx.caption);
      const photos=await photoEvidence(s);
      await ctx.recordPreparation({kind:'instagramAndroid',music:music?{...music,...clip}:null,images:ctx.files.length});
      let publication;
      const status=await finishPost({...ctx,snapshot,
        preflight:async()=>{ctx.signal?.throwIfAborted();await verifyNativeCaption(s,ctx.caption,music);if(JSON.stringify(await photoEvidence(s))!==JSON.stringify(photos))throw new InterventionError('The reviewed Android images changed.');},
        publish:async()=>{submitted=true;const id=await s.find('id',nativeId('share_footer_button'));await s.request('/element/'+id+'/click','POST',{});},
        verify:async()=>{
          publication=await instagramPublication(ctx.page.context(),ctx.config.platforms.instagram.handle,baseline,ctx.caption);
          if(!publication.postUrl&&publication.candidates?.length===1){await this.verifyPost(ctx.page,publication.candidates[0],ctx.config.platforms.instagram.handle,ctx.caption);publication.postUrl=publication.candidates[0];}
          if(!publication.postUrl)throw new Error('Feed submission began, but its exact new post could not be confirmed. Verify Instagram before retrying.');
        }
      });
      if(status==='dry_run')await discardPost(s,ctx.caption);
      if(status==='posted'||status==='dry_run'){await removeAlbum(s,album);album=null;}
      retained=this.retainForStory(ctx,status,publication);
      return {status,...(publication?{publication}:{})};
    }catch(e){
      if(!submitted&&owned&&!ctx.signal?.aborted){
        // Preserve the failed native preview for inspection; never discard an unknown or changed draft.
        await snapshot('android-needs-review').catch(()=>{});
      }
      throw e;
    }finally{if(!retained)await this.close();}
  }
  async verifyPost(page,url,handle,caption){
    const owned=await instagramBaseline(page.context(),handle);
    if(!owned.includes(instagramPostUrl(url)))throw new InterventionError('The exact post is not visible in the configured Instagram profile grid. Nothing was shared.');
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.locator('main').waitFor({state:'visible',timeout:30000});
    if(instagramPostUrl(page.url())!==instagramPostUrl(url))throw new InterventionError('Instagram opened a different post.');
    if(caption&&!await instagramCaptionMatches(page,caption))throw new Error('The new Instagram post caption could not be confirmed.');
  }
}
