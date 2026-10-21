// Copyright (c) 2026 Mrinal. Offline music review fixtures; no emulator or publishing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeId} from '../server/automation/android-native.js';
import {feedMusicClip,waitForFeedMusicClip,configureFeedMusicClip,applyTrack,verifyNativeCaption,nativeCaption} from '../server/automation/native-music.js';
import {InterventionError} from '../server/automation/utils.js';

const chosen={key:'9012',title:'Study Light',artist:'Fixture Artist',length:'3:10',selector:'audio_browser_track_0_9012'};
const node=(id,attrs={})=>({'resource-id':nativeId(id),displayed:'true',...attrs});
const photoFrame=()=>[node('media_thumbnail_tray_button'),node('audio_pill_empty_background')];
function clipFrame({duration=30,segment='12.5',title=chosen.title,artist=chosen.artist}={}){
  return [
    node('music_editor_controls_container',{bounds:'[0,824][720,1512]'}),
    node('bottom_sheet_done_button',{text:'Done'}),
    node('song_title',{text:title}),node('track_artist',{text:artist}),
    node('',{tag:'android.widget.SeekBar',text:segment,'content-desc':'Select the part of the audio track to use'}),
    node('fixture_duration_parent',{tag:'android.view.ViewGroup',clickable:'true',bounds:'[552,920][672,1012]'}),
    node('',{tag:'android.view.View',clickable:'false','content-desc':duration+' second clip',bounds:'[576,942][648,990]'})
  ];
}
const without=(nodes,id)=>nodes.filter(n=>n['resource-id']!==nativeId(id));
const withoutDuration=nodes=>nodes.filter(n=>!n['content-desc']?.endsWith(' second clip'));
function frameSession(frames){
  const s={reads:0};
  s.until=async(predicate,message)=>{
    for(let i=0;i<frames.length;i++){
      s.reads++;
      const result=await predicate(frames[i]);
      if(result)return result;
    }
    throw new InterventionError(message);
  };
  return s;
}
function clipSession({duration=30,initialFrames,reviewedDuration,confirmPicker=true,closeFrames}={}){
  const s={phase:'editor',duration,pickerSeconds:duration,touches:[],reads:{editor:0,picker:0,closing:0},editorIndex:0,closingIndex:0};
  s.editorFrames=initialFrames||[clipFrame({duration})];
  s.closeFrames=closeFrames||[photoFrame()];
  s.screen=async()=>{
    s.reads[s.phase]=(s.reads[s.phase]||0)+1;
    if(s.phase==='editor')return s.editorFrames[Math.min(s.editorIndex++,s.editorFrames.length-1)];
    if(s.phase==='picker')return [{'resource-id':'android:id/numberpicker_input',displayed:'true',text:s.pickerSeconds+' SECONDS'}];
    if(s.phase==='closing')return s.closeFrames[Math.min(s.closingIndex++,s.closeFrames.length-1)];
    assert.fail('Unexpected fixture phase '+s.phase);
  };
  s.until=async(predicate,message)=>{
    for(let i=0;i<24;i++){
      const result=await predicate(await s.screen());
      if(result)return result;
    }
    throw new InterventionError(message);
  };
  s.click=async(using,selector)=>{
    s.touches.push({using,selector});
    assert.equal(using,'xpath');
    if(s.phase==='editor'){
      assert(selector.includes(nativeId('music_editor_controls_container')),'Duration selection must stay inside the music editor');
      assert(selector.includes(s.duration+' second clip'),'Use the observed semantic duration label');
      assert(selector.includes('/parent::*[@clickable="true"]'),'Tap the clickable parent of the non-clickable duration label');
      assert(!selector.includes('@bounds'),'Transient accessibility bounds cannot identify the duration control');
      s.phase='picker';return;
    }
    assert.equal(s.phase,'picker');
    const seconds=Number(selector.match(/@text="(\d+) SECONDS"/)?.[1]);
    assert(Number.isInteger(seconds),'The fixture only exposes observed picker buttons');
    assert.equal(Math.abs(seconds-s.pickerSeconds),1);
    if(confirmPicker)s.pickerSeconds=seconds;
  };
  s.clickId=async id=>{
    s.touches.push({using:'id',selector:id});
    if(id==='music_duration_picker_done_button'){
      assert.equal(s.phase,'picker');s.duration=reviewedDuration??s.pickerSeconds;
      s.editorFrames=[clipFrame({duration:s.duration})];s.editorIndex=0;s.phase='editor';return;
    }
    assert.equal(id,'bottom_sheet_done_button');assert.equal(s.phase,'editor');s.phase='closing';
  };
  return s;
}

test('feed clip reads the native View duration label and requires the exact visible track and review controls',()=>{
  const valid=clipFrame(),clip=feedMusicClip(valid,chosen);
  assert.equal(clip.durationSeconds,30);assert.equal(clip.segmentStart,'12.5');assert.equal(clip.durationDescription,'30 second clip');
  const invalid=[
    ['another title',clipFrame({title:'Different song'})],
    ['another artist',clipFrame({artist:'Different artist'})],
    ['missing title',without(valid,'song_title')],
    ['duplicate title',[...valid,node('song_title',{text:chosen.title})]],
    ['hidden artist',valid.map(n=>n['resource-id']===nativeId('track_artist')?{...n,displayed:'false'}:n)],
    ['missing editor',without(valid,'music_editor_controls_container')],
    ['early Done only',[node('bottom_sheet_done_button')]],
    ['missing duration',withoutDuration(valid)],
    ['duplicate duration',[...valid,node('',{tag:'android.view.View','content-desc':'30 second clip'})]],
    ['hidden duration',valid.map(n=>n['content-desc']==='30 second clip'?{...n,displayed:'false'}:n)],
    ['zero duration',clipFrame({duration:0})],
    ['out-of-range duration',clipFrame({duration:91})],
    ['unreadable segment',clipFrame({segment:'Loading'})],
    ['duplicate segment',[...valid,node('',{tag:'android.widget.SeekBar',text:'12.5','content-desc':'Select the part of the audio track to use'})]]
  ];
  for(const [label,nodes] of invalid)assert.equal(feedMusicClip(nodes,chosen),null,label);
});

test('review waits for consecutive matching track, segment and duration frames after loading and changed values',async()=>{
  const frames=[
    [node('bottom_sheet_done_button')],withoutDuration(clipFrame()),
    clipFrame({segment:'11'}),clipFrame({segment:'12'}),clipFrame({segment:'12',duration:15}),
    clipFrame({segment:'12'}),clipFrame({segment:'12',title:'Another title'}),
    clipFrame({segment:'12'}),clipFrame({segment:'12',artist:'Another artist'}),
    clipFrame({segment:'12'}),clipFrame({segment:'12'})
  ];
  const s=frameSession(frames),clip=await waitForFeedMusicClip(s,chosen);
  assert.equal(s.reads,frames.length);assert.equal(clip.segmentStart,'12');assert.equal(clip.durationSeconds,30);
});

test('default 30-second music skips the duration picker and waits for the music editor to close',async()=>{
  const s=clipSession({
    initialFrames:[[node('bottom_sheet_done_button')],withoutDuration(clipFrame()),clipFrame(),clipFrame()],
    closeFrames:[[...clipFrame(),...photoFrame()],[node('media_thumbnail_tray_button')],photoFrame()]
  });
  assert.deepEqual(await configureFeedMusicClip(s,chosen),{durationSeconds:30,segmentStart:'12.5'});
  assert.deepEqual(s.touches,[{using:'id',selector:'bottom_sheet_done_button'}]);
  assert.equal(s.reads.editor,4);assert.equal(s.reads.picker,0);assert.equal(s.reads.closing,3);
});

test('15-to-30 music uses the observed duration label parent and verifies the picker and reviewed result',async()=>{
  const s=clipSession({duration:15});
  assert.deepEqual(await configureFeedMusicClip(s,chosen,30),{durationSeconds:30,segmentStart:'12.5'});
  assert.equal(s.pickerSeconds,30);
  assert.deepEqual(s.touches.filter(t=>t.using==='id').map(t=>t.selector),['music_duration_picker_done_button','bottom_sheet_done_button']);
  assert.deepEqual(s.touches.slice(1,-2).map(t=>Number(t.selector.match(/@text="(\d+) SECONDS"/)?.[1])),Array.from({length:15},(_,i)=>i+16));
  assert.equal(s.reads.editor,4,'The changed duration must receive a fresh stable review');
});

test('an unchanged picker value cannot confirm a requested duration or proceed to either Done button',async()=>{
  const s=clipSession({duration:15,confirmPicker:false});
  await assert.rejects(configureFeedMusicClip(s,chosen,30),error=>error instanceof InterventionError&&/confirm the requested clip duration/.test(error.message));
  assert.equal(s.touches.length,2);assert(s.touches.every(t=>t.using==='xpath'));
  assert.equal(s.phase,'picker');assert.equal(s.reads.closing,0);
});

test('a changed duration after picker confirmation preserves the editor instead of accepting its Done button',async()=>{
  const s=clipSession({duration:15,reviewedDuration:15});
  await assert.rejects(configureFeedMusicClip(s,chosen,30),/reviewed music duration changed/);
  assert.deepEqual(s.touches.filter(t=>t.using==='id').map(t=>t.selector),['music_duration_picker_done_button']);
  assert.equal(s.phase,'editor');assert.equal(s.reads.closing,0);
});

test('mismatched or incomplete clip review never touches the duration or editor controls',async t=>{
  for(const [label,frame] of [
    ['wrong title',clipFrame({title:'Other title'})],['wrong artist',clipFrame({artist:'Other artist'})],
    ['missing duration',withoutDuration(clipFrame())],
    ['duplicate duration',[...clipFrame(),node('',{'content-desc':'15 second clip'})]],
    ['hidden duration',clipFrame().map(n=>n['content-desc']==='30 second clip'?{...n,displayed:'false'}:n)]
  ])await t.test(label,async()=>{
    const s=clipSession({initialFrames:[frame]});
    await assert.rejects(configureFeedMusicClip(s,chosen),/music review is still loading or does not match/);
    assert.deepEqual(s.touches,[]);assert.equal(s.reads.closing,0);
  });
});

test('a persistent editor after Done cannot count as a completed music application',async()=>{
  const s=clipSession({closeFrames:[[...photoFrame(),...clipFrame()]]});
  await assert.rejects(configureFeedMusicClip(s,chosen),/did not finish applying the verified music clip/);
  assert.deepEqual(s.touches,[{using:'id',selector:'bottom_sheet_done_button'}]);
});

test('invalid requested durations fail before reading, touching or reporting progress',async()=>{
  for(const duration of [0,15.5,20,90,'30',null,NaN]){
    const unexpected=async()=>assert.fail('Invalid duration must fail before interacting with the session');
    await assert.rejects(configureFeedMusicClip({until:unexpected,screen:unexpected,click:unexpected,clickId:unexpected},chosen,duration,unexpected),error=>error instanceof InterventionError&&/15 or 30 second/.test(error.message));
  }
});

test('applying a chosen feed song goes through stable clip review before returning',async()=>{
  const s=clipSession({closeFrames:[[...photoFrame(),...clipFrame()],photoFrame()]}),screen=s.screen,click=s.click,clickId=s.clickId;
  s.phase='library';
  s.screen=async()=>{
    if(s.phase==='library')return [node('row_search_edit_text'),node('music_browser_container'),{'resource-id':chosen.selector,displayed:'true'},node('song_title',{text:chosen.title}),node('artist_name',{text:chosen.artist+' \u2022 '+chosen.length})];
    if(s.phase==='preview')return [{'resource-id':'audio_bar_select_tap_target',displayed:'true','content-desc':'Select track '+chosen.title+' by '+chosen.artist},{displayed:'true','content-desc':'Pause track '+chosen.title+' by '+chosen.artist}];
    if(s.phase==='photo')return photoFrame();
    return screen();
  };
  s.click=async(using,selector)=>{
    if(using==='id'&&selector===chosen.selector){s.touches.push({using,selector});assert.equal(s.phase,'library');s.phase='preview';return;}
    if(using==='id'&&selector==='audio_bar_select_tap_target'){s.touches.push({using,selector});assert.equal(s.phase,'preview');s.phase='photo';return;}
    return click(using,selector);
  };
  s.clickId=async id=>{
    if(id==='audio_pill_empty_background'){s.touches.push({using:'id',selector:id});assert.equal(s.phase,'photo');s.phase='editor';return;}
    return clickId(id);
  };
  assert.deepEqual(await applyTrack(s,chosen),{durationSeconds:30,segmentStart:'12.5'});
  assert.deepEqual(s.touches.map(t=>t.selector),[chosen.selector,'audio_bar_select_tap_target','audio_pill_empty_background','bottom_sheet_done_button']);
  assert.equal(s.reads.editor,2);assert.equal(s.reads.closing,2);assert.equal(s.reads.picker,0);
});

test('applying a feed song rejects invalid duration before reading, touching or reporting progress',async()=>{
  for(const duration of [0,15.5,20,90,'30',null,NaN]){
    const unexpected=async()=>assert.fail('Invalid duration must fail before interacting with the session');
    await assert.rejects(applyTrack({until:unexpected,screen:unexpected,click:unexpected,clickId:unexpected},chosen,duration,unexpected),error=>error instanceof InterventionError&&/15 or 30 second/.test(error.message));
  }
});


const longReviewCaption=('GO Classes lecture update: review the examples and practise each question before the next lesson.\n').repeat(9).slice(0,723);
function postReviewFrame({top=true,music=false,caption=longReviewCaption,title=chosen.title,artist=chosen.artist}={}){
  return [
    node('share_footer_button',{text:'Share'}),node('scroll_view',{scrollable:'true'}),
    node('caption_input_text_view',{text:caption,displayed:top?'true':'false'}),
    node('photo_media_preview_image_view',{displayed:top?'true':'false',bounds:'[32,128][280,376]'}),
    node('music_track_title',{text:title,displayed:music?'true':'false'}),
    node('music_track_subtitle',{text:artist,displayed:music?'true':'false'})
  ];
}
function postReviewSession(initial,scrolls=[]){
  const s={nodes:initial,calls:[],gestures:[],scrollIndex:0};
  s.screen=async()=>{s.calls.push({method:'screen'});return s.nodes;};
  s.find=async(using,selector)=>{
    s.calls.push({method:'find',using,selector});
    assert.equal(using,'xpath');
    assert(selector.includes(nativeId('scroll_view')));
    assert(selector.includes('@displayed="true"'));
    assert(!selector.includes('share_footer_button'),'Final publication must never be located');
    return 'review-scroll-1';
  };
  s.request=async(endpoint,method,body)=>{
    s.calls.push({method:'request',endpoint,body});
    assert.equal(endpoint,'/execute/sync','Only a bounded scroll gesture is permitted');
    assert.equal(method,'POST');
    assert.equal(body.script,'mobile: scrollGesture');
    assert.equal(body.args.length,1);
    const expected=scrolls[s.scrollIndex++];
    assert(expected,'No additional gesture is authorized by this offline fixture');
    assert.deepEqual(body.args[0],{elementId:'review-scroll-1',direction:expected.direction,percent:.7});
    s.gestures.push(expected.direction);s.nodes=expected.nodes;
    return Object.hasOwn(expected,'canScrollMore')?expected.canScrollMore:expected.direction==='down';
  };
  s.until=async(predicate,message)=>{
    for(let attempt=0;attempt<12;attempt++){
      const value=await predicate(await s.screen());
      if(value)return value;
    }
    throw new InterventionError(message);
  };
  s.click=s.clickId=s.adb=async()=>assert.fail('Caption verification must never click, share or issue raw gestures');
  return s;
}

test('a 723-character caption scrolls to the exact music row and restores its image and caption viewport',async()=>{
  assert.equal(longReviewCaption.length,723);
  const top=postReviewFrame(),bottom=postReviewFrame({top:false,music:true}),restored=postReviewFrame();
  const s=postReviewSession(top,[{direction:'down',nodes:bottom},{direction:'up',nodes:restored}]);
  await verifyNativeCaption(s,longReviewCaption,chosen);
  assert.deepEqual(s.gestures,['down','up']);
  assert.equal(s.nodes,restored,'Leave the photo viewport ready for the final image hash check');
  assert.equal(s.nodes.find(n=>n['resource-id']===nativeId('photo_media_preview_image_view')).displayed,'true');
  assert.equal(s.nodes.find(n=>n['resource-id']===nativeId('caption_input_text_view')).text,longReviewCaption);
  assert.equal(s.calls.filter(c=>c.method==='find').length,2);
});

test('caption verification restores a scrolled review before checking caption and music',async()=>{
  const bottom=postReviewFrame({top:false,music:true}),top=postReviewFrame();
  const s=postReviewSession(bottom,[{direction:'up',nodes:top},{direction:'down',nodes:bottom},{direction:'up',nodes:top}]);
  await verifyNativeCaption(s,longReviewCaption,chosen);
  assert.deepEqual(s.gestures,['up','down','up']);assert.equal(s.nodes,top);
});

test('music review rejects a different title or artist without proceeding to publication',async t=>{
  for(const [label,attributes] of [['title',{title:'Another song'}],['artist',{artist:'Another artist'}]]){
    await t.test(label,async()=>{
      const s=postReviewSession(postReviewFrame(),[{direction:'down',nodes:postReviewFrame({top:false,music:true,...attributes})}]);
      await assert.rejects(verifyNativeCaption(s,longReviewCaption,chosen),error=>error instanceof InterventionError&&/reviewed Instagram music changed/.test(error.message));
      assert.deepEqual(s.gestures,['down']);
    });
  }
});

test('music review rechecks the unchanged caption after restoring the photo viewport',async()=>{
  const changed=postReviewFrame({caption:longReviewCaption+' edited'});
  const s=postReviewSession(postReviewFrame(),[{direction:'down',nodes:postReviewFrame({top:false,music:true})},{direction:'up',nodes:changed}]);
  await assert.rejects(verifyNativeCaption(s,longReviewCaption,chosen),/caption changed during music review/);
  assert.deepEqual(s.gestures,['down','up']);
});

test('a changed initial caption stops before any music-review scroll',async()=>{
  const s=postReviewSession(postReviewFrame({caption:'A different draft'}));
  await assert.rejects(verifyNativeCaption(s,longReviewCaption,chosen),/post or caption changed after review/);
  assert.deepEqual(s.gestures,[]);assert.equal(s.calls.filter(c=>c.method==='find').length,0);
});

test('missing or hidden music rows stop after bounded review scrolling',async t=>{
  const complete=postReviewFrame({top:false,music:true});
  for(const [label,bottom] of [
    ['missing song row',postReviewFrame({top:false})],
    ['missing title',without(complete,'music_track_title')],
    ['missing artist',without(complete,'music_track_subtitle')],
    ['hidden artist',complete.map(n=>n['resource-id']===nativeId('music_track_subtitle')?{...n,displayed:'false'}:n)]
  ])await t.test(label,async()=>{
    const s=postReviewSession(postReviewFrame(),Array.from({length:8},()=>({direction:'down',nodes:bottom})));
    await assert.rejects(verifyNativeCaption(s,longReviewCaption,chosen),/did not expose the selected song/);
    assert(s.gestures.length>0&&s.gestures.length<=8);assert(s.gestures.every(direction=>direction==='down'));
  });
});

test('duplicate visible music titles or artists cannot count as the selected song',async t=>{
  for(const id of ['music_track_title','music_track_subtitle'])await t.test(id,async()=>{
    const bottom=[...postReviewFrame({top:false,music:true}),node(id,{text:id==='music_track_title'?chosen.title:chosen.artist})];
    const s=postReviewSession(postReviewFrame(),[{direction:'down',nodes:bottom}]);
    await assert.rejects(verifyNativeCaption(s,longReviewCaption,chosen),/reviewed Instagram music changed/);
    assert.deepEqual(s.gestures,['down']);
  });
});

test('unknown, missing, hidden or duplicate post-review scroll containers cannot receive gestures',async t=>{
  const top=postReviewFrame(),missing=without(top,'scroll_view');
  for(const [label,frame] of [
    ['unknown container',[...missing,node('unrecognized_scroll_view',{scrollable:'true'})]],
    ['missing container',missing],
    ['hidden container',top.map(n=>n['resource-id']===nativeId('scroll_view')?{...n,displayed:'false'}:n)],
    ['duplicate container',[...top,node('scroll_view',{scrollable:'true'})]],
    ['missing review footer',without(top,'share_footer_button')]
  ])await t.test(label,async()=>{
    const s=postReviewSession(frame);
    await assert.rejects(verifyNativeCaption(s,longReviewCaption,chosen),/native post review changed/);
    assert.deepEqual(s.gestures,[]);assert.equal(s.calls.filter(c=>c.method==='find').length,0);
  });
});

test('native music overlays stop review even when the caption and image remain visible underneath',async t=>{
  for(const id of ['music_editor_controls_container','music_editor_done_button','row_search_edit_text']){
    for(const music of [chosen,undefined])await t.test(id+(music?' with music':' without music'),async()=>{
      const s=postReviewSession([...postReviewFrame({music:true}),node(id)]);
      await assert.rejects(verifyNativeCaption(s,longReviewCaption,music),/native post review changed/);
      assert.deepEqual(s.gestures,[]);assert.equal(s.calls.filter(c=>c.method==='find').length,0);
    });
  }
});

test('a music overlay appearing during scrolling cannot be accepted as completed music review',async()=>{
  const bottom=[...postReviewFrame({top:false,music:true}),node('music_editor_controls_container')];
  const s=postReviewSession(postReviewFrame(),[{direction:'down',nodes:bottom}]);
  await assert.rejects(verifyNativeCaption(s,longReviewCaption,chosen),/native post review changed/);
  assert.deepEqual(s.gestures,['down']);
});

test('a missing image viewport after music review cannot pass the final caption check',async()=>{
  const bottom=postReviewFrame({top:false,music:true});
  const s=postReviewSession(postReviewFrame(),[{direction:'down',nodes:bottom},...Array.from({length:8},()=>({direction:'up',nodes:bottom}))]);
  await assert.rejects(verifyNativeCaption(s,longReviewCaption,chosen),/did not restore the image and caption review/);
  assert.equal(s.gestures[0],'down');assert(s.gestures.slice(1).every(direction=>direction==='up'));assert(s.gestures.length<=9);
});

test('no-music caption verification needs no scrolling when the image and caption are already visible',async()=>{
  const s=postReviewSession(postReviewFrame());
  await verifyNativeCaption(s,longReviewCaption);
  assert.deepEqual(s.gestures,[]);assert.deepEqual(s.calls,[{method:'screen'}]);
});


test('music review continues restoring above a partially visible image until scrolling confirms the start',async()=>{
  const top=postReviewFrame(),bottom=postReviewFrame({top:false,music:true});
  const partial=postReviewFrame().map(n=>n['resource-id']===nativeId('photo_media_preview_image_view')?{...n,bounds:'[32,0][280,80]'}:n);
  const restored=postReviewFrame();
  const s=postReviewSession(top,[
    {direction:'down',nodes:bottom,canScrollMore:true},
    {direction:'up',nodes:partial,canScrollMore:true},
    {direction:'up',nodes:restored,canScrollMore:false}
  ]);
  await verifyNativeCaption(s,longReviewCaption,chosen);
  assert.deepEqual(s.gestures,['down','up','up']);
  assert.equal(s.nodes,restored,'A partially visible image cannot be used for the final image hash check');
  assert.equal(s.nodes.find(n=>n['resource-id']===nativeId('photo_media_preview_image_view')).bounds,'[32,128][280,376]');
});

test('non-boolean native scroll responses cannot confirm the review position',async t=>{
  for(const [label,canScrollMore] of [['undefined',undefined],['null',null],['number',0],['string','false'],['object',{}],['array',[]]]){
    for(const direction of ['down','up'])await t.test(label+' scrolling '+direction,async()=>{
      const top=postReviewFrame(),bottom=postReviewFrame({top:false,music:true});
      const scrolls=direction==='down'
        ?[{direction:'down',nodes:bottom,canScrollMore}]
        :[{direction:'down',nodes:bottom,canScrollMore:true},{direction:'up',nodes:top,canScrollMore}];
      const s=postReviewSession(top,scrolls);
      await assert.rejects(verifyNativeCaption(s,longReviewCaption,chosen),error=>error instanceof InterventionError&&/did not confirm the review scroll position/.test(error.message));
      assert.deepEqual(s.gestures,direction==='down'?['down']:['down','up']);
    });
  }
});


test('typing a native caption restores the canonical top before the image baseline can be captured',async()=>{
  const caption=('GO Classes update \u2764\ufe0f\n\n'+longReviewCaption).slice(0,723);
  const initial=[node('media_thumbnail_tray_button')];
  const fractional=postReviewFrame({caption}).map(n=>n['resource-id']===nativeId('photo_media_preview_image_view')?{...n,bounds:'[32,96][280,344]'}:n);
  const partial=postReviewFrame({caption}).map(n=>n['resource-id']===nativeId('photo_media_preview_image_view')?{...n,bounds:'[32,112][280,360]'}:n);
  const canonical=postReviewFrame({caption});
  const s=postReviewSession(initial,[{direction:'up',nodes:partial,canScrollMore:true},{direction:'up',nodes:canonical,canScrollMore:false}]);
  s.phase='photo-editor';
  s.clickId=async id=>{
    s.calls.push({method:'clickId',id});
    if(id==='media_thumbnail_tray_button'){
      assert.equal(s.phase,'photo-editor');s.phase='review';s.nodes=postReviewFrame({caption:'Previous caption'});return;
    }
    if(id==='caption_input_text_view'){assert.equal(s.phase,'review');s.phase='caption-focused';return;}
    assert.equal(id,'next_button_textview','Only the observed caption OK control may be tapped');
    assert.equal(s.phase,'caption-typed');s.phase='final-review';s.nodes=fractional;
  };
  s.replaceText=async(using,id,text)=>{
    s.calls.push({method:'replaceText',using,id,text});
    assert.equal(s.phase,'caption-focused');assert.equal(using,'id');assert.equal(id,nativeId('caption_input_text_view'));assert.equal(text,caption);
    s.phase='caption-typed';s.nodes=[node('caption_input_text_view',{text}),node('next_button_textview',{text:'OK'})];
  };
  await nativeCaption(s,caption);
  const baselineViewport=await s.screen();
  assert.equal(baselineViewport,canonical,'The caller must observe the canonical top when capturing photo evidence');
  assert.equal(baselineViewport.find(n=>n['resource-id']===nativeId('caption_input_text_view')).text,caption);
  assert.equal(baselineViewport.find(n=>n['resource-id']===nativeId('photo_media_preview_image_view')).bounds,'[32,128][280,376]');
  assert.deepEqual(s.gestures,['up','up']);
  assert.deepEqual(s.calls.filter(c=>c.method==='clickId').map(c=>c.id),['media_thumbnail_tray_button','caption_input_text_view','next_button_textview']);
  assert.deepEqual(s.calls.filter(c=>c.method==='replaceText').map(c=>[c.using,c.id,c.text]),[['id',nativeId('caption_input_text_view'),caption]]);
});
