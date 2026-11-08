// Copyright (c) 2026 Mrinal. Local media rendering; never requests a social site.
import {mediaKind} from '../shared/media-capabilities.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
export function localMediaUrl(value){
 const url=String(value||'');
 if(/^\/(?!\/)[^\\\u0000-\u0020]*$/.test(url)||/^blob:https?:\/\/[^\s\\]+$/.test(url))return url;
 return '';
}
export const mediaTypeLabel=media=>mediaKind(media)==='video'?'Video':mediaKind(media)==='document'?'PDF':'Photo';
export const youtubePreviewTitle=caption=>[...String(caption||'').split(/\r?\n/).find(line=>line.trim())?.trim()||''].slice(0,100).join('').replace(/[<>]/g,'').trim();
export function mediaFacts(media){
 const kind=mediaKind(media),format=(media.format||media.filename?.split('.').at(-1)||'').toUpperCase();
 const bytes=media.size>=1048576?(media.size/1048576).toFixed(1)+' MB':Math.round((media.size||0)/1024)+' KB';
 const dimensions=media.width&&media.height?media.width+' × '+media.height:'';
 const duration=Number.isFinite(media.durationSeconds)?Math.floor(media.durationSeconds/60)+':'+String(Math.floor(media.durationSeconds%60)).padStart(2,'0'):'';
 return [kind==='document'?(media.pageCount?media.pageCount+' pages':'PDF document'):dimensions,kind==='video'?duration:'',bytes,format].filter(Boolean).join(' · ');
}
export function mediaVisual(media,{compact=false,controls=false,className='',id='',alt=media.name||mediaTypeLabel(media)}={}){
 const kind=mediaKind(media),url=localMediaUrl(media.url),attributes=(className?' class="'+esc(className)+'"':'')+(id?' id="'+esc(id)+'"':'');
 if(kind==='video')return '<video'+attributes+' src="'+esc(url)+'" aria-label="'+esc(alt)+'" playsinline preload="'+(compact?'none':'metadata')+'"'+(controls?' controls':' muted')+'></video>';
 if(kind==='document')return '<span'+attributes+' role="img" aria-label="PDF: '+esc(alt)+'"><span class="pdf-mark">PDF</span>'+(compact?'':'<strong>'+esc(media.title||media.name||'PDF document')+'</strong><small>'+(media.pageCount?esc(media.pageCount)+' pages':'Document preview')+'</small>')+'</span>';
 return '<img'+attributes+' src="'+esc(url)+'" alt="'+esc(alt)+'"'+(compact?' loading="lazy"':'')+'>';
}
export function documentPreview(media,{label='PDF document'}={}){
 const url=localMediaUrl(media.url);
 return '<div class="document-preview" data-document-preview>'+mediaVisual(media,{className:'document-art'})+'<span class="document-kind">'+esc(label)+'</span>'+(url?'<a class="button small" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Open PDF</a>':'')+'</div>';
}
