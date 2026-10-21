// Copyright (c) 2026 Mrinal. All rights reserved.
import sharp from 'sharp';
import {nativeId,nativeBounds,xpathLiteral} from './android-native.js';
import {InterventionError} from './utils.js';
import {nativePostShare} from './native-reference.js';
import {instagramPostUrl} from '../../shared/manychat.js';
const has=(nodes,id)=>nodes.some(n=>n.displayed==='true'&&n['resource-id']===nativeId(id));
export async function openRepost(s,url,{reuseCurrent=false}={}) {
  const exact=instagramPostUrl(url);
  if(!exact)throw new InterventionError('An exact published Instagram post URL is required.');
  if(!reuseCurrent)await s.request('/execute/sync','POST',{script:'mobile: deepLink',args:[{url:exact,package:'com.instagram.android'}]});
  await s.until(nodes=>has(nodes,'row_feed_button_share'),'The exact Instagram post did not open.');
  const control=nativePostShare(await s.screen());
  if(!control)throw new InterventionError('The exact post sharing control is ambiguous. Nothing was shared.');
  const share=control.bounds?await s.find('xpath','//*[@resource-id='+xpathLiteral(nativeId('row_feed_button_share'))+' and @bounds='+xpathLiteral(control.bounds)+']'):await s.find('id',nativeId('row_feed_button_share'));
  const label=await s.request('/element/'+share+'/attribute/content-desc');
  if(!/^Send post[. ]/i.test(label||''))throw new InterventionError('The post sharing control changed.');
  await s.request('/element/'+share+'/click','POST',{});
  await s.until(nodes=>nodes.some(n=>n.displayed==='true'&&n['resource-id']===nativeId('button')&&n['content-desc']==='Add to story'),'This post cannot be shared to a Story.');
  await new Promise(r=>setTimeout(r,600));
  await s.click('xpath','//*[@resource-id='+xpathLiteral(nativeId('button'))+' and @content-desc="Add to story"]');
  await s.until(nodes=>has(nodes,'story_share_controls_action_bar')&&has(nodes,'camera_photo_texture_view'),'The shared-post Story is still loading.');
  return exact;
}
export async function storyCanvas(s) {
  const nodes=await s.screen();
  if(!has(nodes,'story_share_controls_action_bar'))throw new InterventionError('The shared-post Story editor is no longer active.');
  return nativeBounds(nodes.find(n=>n['resource-id']===nativeId('camera_photo_texture_view')));
}
export async function tapCanvas(s,x,y) {
  const c=await storyCanvas(s);
  const scale=c.width/720;
  if(x<c.x+20*scale||x>c.x+c.width-110*scale||y<c.y+140*scale||y>c.y+c.height-180*scale)throw new InterventionError('That Story gesture is outside the editable safe area.');
  await s.gesture([{type:'pointerMove',duration:0,x:Math.round(x),y:Math.round(y)},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]);
}
export async function whiteCard(s,c,{maxY=.88,allowClipped=false,expectedWidth}={}) {
  const {data,info}=await sharp(await s.screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const runs=[];
  for(let y=Math.round(c.y+c.height*.08);y<c.y+c.height*maxY;y++){
    let start=-1;
    for(let x=Math.round(c.x+c.width*.04);x<=c.x+c.width*.96;x++){
      const i=(y*info.width+x)*info.channels;
      const white=x<c.x+c.width*.96&&data[i]>242&&data[i+1]>242&&data[i+2]>242;
      if(white&&start<0)start=x;
      if(!white&&start>=0){if(x-start>=c.width*.28)runs.push({x:start,y,width:x-start});start=-1;}
    }
  }
  const widest=runs.reduce((a,b)=>b.width>(a?.width||0)?b:a,null);
  if(!widest||widest.width<c.width*.4||widest.width>c.width*.91)throw new InterventionError('The framed shared-post card could not be located safely.');
  const full=runs.filter(r=>r.width>=widest.width*.94&&r.x>=widest.x-8&&r.x<=widest.x+widest.width*.2);
  const y=full[0]?.y,bottom=full.at(-1)?.y;
  if(full.length<(allowClipped?3:12)||!allowClipped&&(bottom-y<c.height*.18||bottom-y>c.height*.78)||expectedWidth&&Math.abs(widest.width-expectedWidth)>c.width*.04)throw new InterventionError('The shared-post card bounds are ambiguous.');
  return {x:widest.x,y,width:widest.width,height:bottom-y};
}
export async function pinchItem(s,center,width,ratio,screenWidth=720) {
  if(Math.abs(ratio-1)<.025)return;
  if(ratio<.45||ratio>1.8)throw new InterventionError('Story resize exceeds the supported safe range.');
  const radius=width*.22;
  const actions=[-1,1].map((direction,i)=>({type:'pointer',id:'story-finger-'+i,parameters:{pointerType:'touch'},actions:[
    {type:'pointerMove',duration:0,x:Math.round(Math.min(center.x,screenWidth*390/720)),y:Math.round(center.y+direction*radius)},
    {type:'pointerDown',button:0},{type:'pause',duration:100},
    {type:'pointerMove',duration:650,x:Math.round(Math.min(center.x,screenWidth*390/720)),y:Math.round(center.y+direction*radius*ratio)},{type:'pointerUp',button:0}
  ]}));
  await s.request('/actions','POST',{actions});
}
export function nativeStoryTarget(c,layout,box,{hasLink=true}={}){
  const ratio=c.width*layout.card.width/box.width,height=box.height*ratio,desired={x:c.x+c.width*layout.card.x,y:c.y+c.height*layout.card.y};
  if(desired.y-height/2<c.y+c.height*.08)throw new InterventionError('The post card is too high for the Story safe area. Move it down or use Auto-align in Compose.');
  if(desired.y+height/2>c.y+c.height*(hasLink?layout.link.y-.065:.9))throw new InterventionError('The post card overlaps the link or Story safe area. Move or resize it in Compose.');
  return {desired,ratio};
}
export async function placeRepost(s,layout,{framed=false,hasLink=true}={}) {
  const c=await storyCanvas(s);
  if(!framed){await tapCanvas(s,c.x+c.width*.45,c.y+c.height*.5);await new Promise(r=>setTimeout(r,500));}
  const boundsOptions=framed?{maxY:layout.link.y-.05}:{};
  const box=await whiteCard(s,c,boundsOptions);
  const {desired}=nativeStoryTarget(c,layout,box,{hasLink});
  let after=box;
  for(let attempt=0;attempt<3&&Math.abs(after.width-c.width*layout.card.width)>c.width*.025;attempt++){
    const center={x:after.x+after.width/2,y:after.y+after.height/2},ratio=c.width*layout.card.width/after.width;
    await pinchItem(s,center,after.width,ratio,c.width);await new Promise(r=>setTimeout(r,350));after=await whiteCard(s,c,boundsOptions);
  }
  nativeStoryTarget(c,layout,after,{hasLink});
  for(let attempt=0;attempt<3;attempt++){
    const current={x:after.x+after.width/2,y:after.y+after.height/2};
    if(Math.abs(current.y-desired.y)<c.height*.025&&Math.abs(current.x-desired.x)<c.width*.025)break;
    // GPU post cards ignore UiAutomator long-press dragGesture. A continuous
    // Android touch swipe moves the card without holding it first.
    await s.adb(['shell','input','swipe',String(Math.round(current.x-40)),String(Math.round(current.y)),String(Math.round(desired.x-40)),String(Math.round(desired.y)),'650']);
    await new Promise(r=>setTimeout(r,450));after=await whiteCard(s,c,boundsOptions);
  }
  if(Math.abs((after.y+after.height/2)-desired.y)>c.height*.035||Math.abs((after.x+after.width/2)-desired.x)>c.width*.035||Math.abs(after.width-c.width*layout.card.width)>c.width*.045)throw new InterventionError('Instagram did not apply the reviewed post-card position. Nothing was shared; check the native Story preview.');
  if(after.y<c.y+c.height*.08||after.y+after.height>c.y+c.height*(hasLink?layout.link.y-.065:.9))throw new InterventionError('The post card overlaps the link or Story safe area. Move or resize it in Compose.');
  return {canvas:c,card:after};
}

export async function stashRepost(s){
  const c=await storyCanvas(s),original=await whiteCard(s,c);
  let current=original;
  for(let i=0;i<3;i++){
    const bottom=current.y+current.height,target=c.y+c.height*.42;
    if(bottom<=target)return {canvas:c,original};
    const from={x:original.x+original.width/2-40,y:bottom-Math.min(180,original.height*.25)};
    const to={x:from.x,y:Math.max(c.y+55,from.y-(bottom-target+65))};
    await s.adb(['shell','input','swipe',String(Math.round(from.x)),String(Math.round(from.y)),String(Math.round(to.x)),String(Math.round(to.y)),'650']);
    await new Promise(r=>setTimeout(r,400));current=await whiteCard(s,c,{allowClipped:true,expectedWidth:original.width});
  }
  if(current.y+current.height>c.y+c.height*.45)throw new InterventionError('The shared post still covers the link insertion area. Nothing was shared.');
  return {canvas:c,original};
}
export async function restoreRepost(s,stash,layout){
  const c=stash.canvas,current=await whiteCard(s,c,{maxY:layout.link.y-.05,allowClipped:true,expectedWidth:stash.original.width});
  const bottom=current.y+current.height,center=bottom-stash.original.height/2;
  const from={x:stash.original.x+stash.original.width/2-40,y:bottom-Math.min(170,stash.original.height*.25)};
  const shift=c.y+c.height*layout.card.y-center;
  await s.adb(['shell','input','swipe',String(Math.round(from.x)),String(Math.round(from.y)),String(Math.round(from.x)),String(Math.round(from.y+shift+45)),'650']);
  await new Promise(r=>setTimeout(r,450));
  return placeRepost(s,layout,{framed:true});
}
