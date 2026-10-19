// Copyright (c) 2026 Mrinal. All rights reserved.
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {AndroidSession,nativeId} from './android-native.js';
import {openRepost,placeRepost,stashRepost,restoreRepost} from './native-repost.js';
import {addStoryLink,instagramOnlyStoryAudience,storyAudienceEvidence,discardStory} from './native-story.js';
import {musicResults,searchMusic,applyTrack,openMusicLibrary,nativeCaption,verifyNativeCaption,discardPost} from './native-music.js';
import {pushAlbum,removeAlbum,openGallery,selectAlbumPhotos,photoEvidence} from './native-photos.js';
import {instagramBaseline,instagramPublication,instagramCaptionMatches} from './instagram-reference.js';
import {instagramPostUrl} from '../../shared/manychat.js';
import {instagramOptions} from '../../shared/instagram.js';
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
  async open(config,signal){
    if(this.busy)throw new InterventionError('Finish choosing Instagram music before starting a run.');
    this.busy=true;
    try{this.s=await this.sessionFactory({signal}).open({start:true});await this.s.account(config.platforms.instagram.handle);return this.s;}
    catch(e){await this.close();throw e;}
  }
  async close(){
    clearTimeout(this.timer);
    try{await this.s?.close();}finally{this.s=null;this.busy=false;this.picker=null;this.operation=false;}
  }
  async closePicker(){if(this.picker)await discardStory(this.s);}
  expirePicker(){clearTimeout(this.timer);this.timer=setTimeout(()=>{if(this.operation)this.expirePicker();else this.cancelPicker().catch(()=>{});},5*60*1000);this.timer.unref();}
  async startPicker(config,postUrl){
    this.opening=true;
    try{await this.open(config);}catch(e){this.opening=false;throw e;}
    try{
      this.picker={account:config.platforms.instagram.handle,query:'',results:[]};
      await openRepost(this.s,postUrl);
      await this.s.click('id','music_button');
      await this.s.until(n=>n.some(x=>x['resource-id']===nativeId('row_search_edit_text')),'Instagram music is unavailable.');
      this.picker.results=musicResults(await this.s.screen());
      this.expirePicker();
      return {results:this.picker.results};
    }catch(e){await this.closePicker().catch(()=>{});await this.close();throw e;}finally{this.opening=false;}
  }
  async query(query){
    if(this.opening||!this.picker||this.operation)throw new Error('Open the music picker again.');
    if(typeof query!=='string'||query.trim().length<2||query.length>100)throw new Error('Search with 2-100 characters.');
    this.operation=true;
    try{this.expirePicker();this.picker.query=query.trim();this.picker.results=await searchMusic(this.s,this.picker.query);return {results:this.picker.results};}
    finally{this.operation=false;}
  }
  async preview(key){
    if(this.opening||!this.picker||this.operation)throw new Error('Wait for the current music operation.');
    this.operation=true;this.expirePicker();
    try{
      const result=this.picker.results.find(r=>r.key===key),current=musicResults(await this.s.screen()).find(r=>r.key===key);
      if(!result||!current||result.title!==current.title||result.artist!==current.artist)throw new Error('Search for that song again.');
      await this.s.click('id',current.selector);
      await this.s.until(nodes=>nodes.some(n=>n['resource-id']==='audio_bar_select_tap_target'&&n['content-desc']==='Select track '+result.title+' by '+result.artist),'The audio preview did not load.');
      return {playing:key};
    }finally{this.operation=false;}
  }
  async choose(key){
    if(this.opening||!this.picker||this.operation)throw new Error('Open the music picker again.');
    this.operation=true;
    try{
      const result=this.picker.results.find(r=>r.key===key);
      if(!result||!musicResults(await this.s.screen()).some(r=>r.key===key&&r.title===result.title&&r.artist===result.artist))throw new Error('Search for that song again.');
      const selection={...result,id:randomUUID(),account:this.picker.account,query:this.picker.query||result.title,durationSeconds:30,createdAt:new Date().toISOString()};
      delete selection.selector;this.selections.push(selection);
      await atomicWrite(path.join(this.dataDir,'instagram-music.json'),this.selections);
      await this.closePicker();await this.close();return {selection};
    }catch(e){this.operation=false;throw e;}
  }
  async cancelPicker(){if(this.opening)throw new Error('Wait for the Instagram library to open, then close it.');if(this.operation)throw new Error('Wait for the current music search to finish.');try{await this.closePicker();}finally{await this.close();}}
  async applyStoryMusic(s,music){
    await s.click('id','music_button');
    await s.until(n=>n.some(x=>x['resource-id']===nativeId('row_search_edit_text')),'Story music did not open.');
    const results=await searchMusic(s,music.query);
    const match=results.find(r=>r.key===music.key&&r.title===music.title&&r.artist===music.artist);
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
  async checkAccount(config){try{await this.open(config);}finally{await this.close();}}
  async run(ctx){
    const options=instagramOptions(ctx.instagram),music=this.selection(options.music.selection,ctx.config.platforms.instagram.handle);
    await ctx.step('Checking the dedicated Android Instagram account...');
    const s=await this.open(ctx.config,ctx.signal);
    let submitted=false,album,owned=false;
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
        let source=options.story.sourcePostUrl||ctx.instagramPublication?.postUrl;
        if(!source&&ctx.mode==='TEST')source=(await instagramBaseline(ctx.page.context(),ctx.config.platforms.instagram.handle))[0];
        const url=instagramPostUrl(source);
        if(!url)throw new InterventionError('The exact feed-post permalink is not confirmed. Enter its URL or verify the feed result before retrying only this Story.');
        await this.verifyPost(ctx.page,url,ctx.config.platforms.instagram.handle);
        await ctx.step('Opening the exact feed post as a Story...');
        await openRepost(s,url);owned=true;
        await ctx.step('Applying the reviewed shared-post card layout...');
        await placeRepost(s,options.story.layout);
        await ctx.step('Adding the selected Story music and link...');
        const audio=await this.applyStoryMusic(s,music);
        const stash=await stashRepost(s);
        await addStoryLink(s,options.story);
        await restoreRepost(s,stash,options.story.layout);
        const evidence=await instagramOnlyStoryAudience(s);
        await ctx.recordPreparation({kind:'instagramStory',testExistingPost:ctx.mode==='TEST',postUrl:url,music:audio,story:options.story});
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
      await selectAlbumPhotos(s,album);
      await ctx.step('Adding the exact selected music from Instagram...');
      await openMusicLibrary(s);const results=await searchMusic(s,music.query);
      if(!results.some(r=>r.key===music.key&&r.title===music.title&&r.artist===music.artist))throw new InterventionError('The reviewed song is no longer available for this feed post.');
      const clip=await applyTrack(s,music,music.durationSeconds);
      await ctx.step('Verifying the native caption, images and music...');
      await nativeCaption(s,ctx.caption);
      const photos=await photoEvidence(s);
      await ctx.recordPreparation({kind:'instagramMusic',music:{...music,...clip},images:ctx.files.length});
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
      return {status,...(publication?{publication}:{})};
    }catch(e){
      if(!submitted&&owned&&!ctx.signal?.aborted){
        // Preserve the failed native preview for inspection; never discard an unknown or changed draft.
        await snapshot('android-needs-review').catch(()=>{});
      }
      throw e;
    }finally{await this.close();}
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
