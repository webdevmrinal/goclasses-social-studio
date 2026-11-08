// Copyright (c) 2026 Mrinal. Supported attachment routes for this worker.
export const UPLOAD_LIMITS=Object.freeze({image:20*1024*1024,video:512*1024*1024,document:100*1024*1024});
const names={instagram:'Instagram',linkedin:'LinkedIn',x:'X',youtubeDA:'YouTube · GATE DA',youtubeCS:'YouTube · GATE CS',whatsapp:'WhatsApp Channel',telegram:'Telegram Channel',manychat:'ManyChat'};
const imageCounts={instagram:10,linkedin:10,x:4,youtubeDA:10,youtubeCS:10,whatsapp:1,telegram:10};
const videoDestinations=['instagram','linkedin','x','youtubeDA','youtubeCS','whatsapp','telegram'];
export function mediaKind(media){
 if(media?.kind)return ['image','video','document'].includes(media.kind)?media.kind:'unknown';
 if(media?.format==='pdf')return 'document';
 if(['mp4','mov'].includes(media?.format))return 'video';
 return 'image';
}
export function mediaSupport(platform,media){
 const id=typeof platform==='string'?platform:platform?.id,kind=mediaKind(media),name=names[id]||'This destination';
 let reason='';
 if(kind==='image'&&!imageCounts[id])reason=`${name} does not upload images directly.`;
 else if(kind==='video'&&!videoDestinations.includes(id))reason=`${name} does not upload video files directly.`;
 else if(kind==='document'&&!['linkedin','telegram'].includes(id))reason=id==='whatsapp'?'PDF upload is not available in this WhatsApp Channel worker. Choose LinkedIn or Telegram.':`${name} does not support PDF attachments. Choose LinkedIn or Telegram.`;
 else if(!['image','video','document'].includes(kind))reason='This file type is not supported.';
 const size=Number(media?.size)||0,duration=Number(media?.durationSeconds),width=Number(media?.width),height=Number(media?.height);
 if(!reason&&size>UPLOAD_LIMITS[kind])reason=`${media?.name||'This file'} exceeds the ${Math.round(UPLOAD_LIMITS[kind]/1024/1024)} MB upload limit.`;
 if(!reason&&kind==='document'&&id==='linkedin'&&Number(media?.pageCount)>300)reason='LinkedIn documents can contain up to 300 pages.';
 if(!reason&&kind==='video'){
  if(!['mp4','mov'].includes(media?.format))reason='Use an MP4 or MOV video.';
  else if(id==='telegram'&&media.format!=='mp4')reason='Use MP4 for Telegram video uploads so the reviewed file can be verified.';
  else if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0)reason='This video needs a verified duration and dimensions. Upload the original video again.';
  else if(duration>900)reason='This worker uploads videos up to 15 minutes long.';
  else if(id==='instagram'&&duration<3)reason='This worker accepts Instagram Reels between 3 seconds and 15 minutes.';
  else if(id==='x'&&(duration<0.5||duration>140))reason='X videos must be between 0.5 and 140 seconds in this worker.';
  else if(id==='linkedin'&&duration<3)reason='LinkedIn videos must be at least 3 seconds long.';
  else if(id==='linkedin'&&(Math.min(width,height)<144||Math.max(width,height)<256||Math.min(width,height)>2304||Math.max(width,height)>4096||width/height<1/2.4||width/height>2.4))reason='This video is outside LinkedIn’s supported dimensions or aspect ratio.';
  else if(id==='whatsapp'&&size>64*1024*1024)reason='This WhatsApp Channel worker accepts videos up to 64 MB.';
 }
 return {supported:!reason,reason};
}
export function mediaCapabilities(platform){
 const id=typeof platform==='string'?platform:platform?.id;
 return {imageMax:imageCounts[id]||0,videoMax:videoDestinations.includes(id)?1:0,documentMax:['linkedin','telegram'].includes(id)?1:0};
}
export function mediaSelectionErrors(platform,selection=[]){
 const id=typeof platform==='string'?platform:platform?.id,name=names[id]||'This destination';
 if(id==='manychat')return [];
 const errors=selection.map(item=>mediaSupport(id,item)).filter(result=>!result.supported).map(result=>`${name}: ${result.reason}`),kinds=new Set(selection.map(mediaKind));
 if(kinds.size>1)errors.push(`${name}: choose an image gallery, one video, or one PDF per post. Mixed attachment types cannot be combined.`);
 const kind=mediaKind(selection[0]);
 if(selection.length&&(kind==='video'||kind==='document')&&selection.length!==1)errors.push(`${name}: choose one ${kind==='video'?'video':'PDF'} per post.`);
 if(kind==='image'&&selection.length>(imageCounts[id]||0))errors.push(`${name}: use ${imageCounts[id]||0} images or fewer.`);
 return [...new Set(errors)];
}
export function defaultMediaFor(platform,library=[]){
 const id=typeof platform==='string'?platform:platform?.id;
 if(id==='manychat'||id==='instagramStory'||id==='instagramMusic')return [];
 const supported=library.filter(item=>mediaSupport(id,item).supported),first=supported[0];if(!first)return [];
 const kind=mediaKind(first);return supported.filter(item=>mediaKind(item)===kind).slice(0,kind==='image'?imageCounts[id]||0:1);
}
export const isYouTubeShort=media=>mediaKind(media)==='video'&&media.durationSeconds<=180&&media.height>=media.width;
export function mediaPostLabel(platform,selection=[]){const kind=mediaKind(selection[0]);return kind==='document'?'PDF document':kind==='video'?(platform==='instagram'?'Reel':String(platform).startsWith('youtube')&&isYouTubeShort(selection[0])?'Short':'Video'):selection.length>1?'Image gallery':'Image';}
