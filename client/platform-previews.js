// Copyright (c) 2026 Mrinal. Local post previews; no requests to social platforms.
import {lucidePaths} from './icons.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svg=name=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+(lucidePaths[name]||lucidePaths.ellipsis||'<circle cx="12" cy="12" r="2"/>')+'</svg>';
const safeLink=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const avatar='<span class="site-avatar" aria-hidden="true"><b>GO</b><small>CLASSES</small></span>';
function gallery(images,kind){
 if(!images.length)return '';
 return '<div class="site-gallery '+kind+' count-'+images.length+'" aria-label="Selected photos in posting order">'+images.map((m,i)=>'<figure><img src="'+esc(m.url)+'" alt="'+esc(m.name)+'" loading="lazy"><span class="sr-only">Photo '+(i+1)+' of '+images.length+'</span></figure>').join('')+'</div>';
}
const actions=(items)=>'<div class="site-actions" aria-hidden="true">'+items.map(([icon,label])=>'<span>'+svg(icon)+(label?'<small>'+label+'</small>':'')+'</span>').join('')+'</div>';
export function platformPostPreview({id,account,handle='',caption='',images=[],carousel='',route='',links=[]}){
 const channel=['whatsapp','telegram'].includes(id),dm=id==='manychat',name=dm?'Instagram DM':id.startsWith('youtube')?'YouTube':id==='x'?'X':id==='linkedin'?'LinkedIn':id==='whatsapp'?'WhatsApp':id==='telegram'?'Telegram':'Instagram';
 const identity=id==='instagram'?handle||account:account;
 const header='<div class="site-post-author">'+avatar+'<div><strong>'+esc(identity)+'</strong><small>'+(id==='x'?esc(handle?'@'+handle.replace(/^@/,''):'')+' · Just now':channel?'Channel update':id==='linkedin'?'Just now · Public':'Just now')+'</small></div><span class="site-more" aria-hidden="true">'+svg('ellipsis')+'</span></div>';
 const text='<div class="preview-caption site-caption">'+esc(caption)+(route?'<small class="site-route">'+esc(route)+'</small>':'')+'</div>';
 const media=['x','linkedin','telegram'].includes(id)?gallery(images,id==='telegram'?'album':'grid'):(images.length?'<div data-carousel-view="review-'+id+'">'+carousel+'</div>':'');
 let content;
 if(dm)content='<div class="site-chat-title">'+avatar+'<strong>'+esc(handle||'Instagram')+'</strong>'+svg('phone')+'</div><div class="site-dm-body"><small>When someone comments</small><div class="site-dm-message">'+text+links.map(l=>'<a '+(safeLink(l.url)?'href="'+esc(safeLink(l.url))+'" target="_blank" rel="noopener noreferrer"':'aria-disabled="true"')+' class="site-dm-link">'+esc(l.label)+'</a>').join('')+'</div></div><div class="site-chat-input">Message…'+svg('smile')+'</div>';
 else if(channel)content='<div class="site-channel-title">'+svg('arrow-left')+avatar+'<div><strong>'+esc(account)+'</strong><small>Channel</small></div>'+svg('ellipsis-vertical')+'</div><div class="site-channel-body"><div class="site-channel-post">'+media+text+'<div class="site-message-time">Just now '+svg(id==='telegram'?'check-check':'check')+'</div></div></div><div class="site-chat-input">'+svg('plus')+'Channel update'+svg('mic')+'</div>';
 else if(id==='instagram')content=header+media+actions([['heart',''],['message-circle',''],['send',''],['bookmark','']])+text;
 else if(id==='x')content=header+text+media+actions([['message-circle',''],['repeat-2',''],['heart',''],['chart-no-axes-column',''],['share','']]);
 else if(id==='linkedin')content=header+text+media+actions([['thumbs-up','Like'],['message-square','Comment'],['repeat-2','Repost'],['send','Send']]);
 else content=header+text+media+actions([['thumbs-up',''],['thumbs-down',''],['message-square',''],['share-2','Share']]);
 return '<div class="site-preview site-'+id+'" data-site-preview="'+id+'"><div class="site-brand"><strong>'+esc(name)+'</strong><span>Preview</span></div>'+content+'</div>';
}
