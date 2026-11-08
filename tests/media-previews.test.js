// Copyright (c) 2026 Mrinal. Local media previews, with no social or publishing calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaVisual,mediaFacts,mediaTypeLabel,documentPreview,localMediaUrl,youtubePreviewTitle} from '../client/media-preview.js';
import {platformPostPreview} from '../client/platform-previews.js';
const video={id:'clip',kind:'video',format:'mp4',url:'/media/clip.mp4',name:'Launch <clip>.mp4',size:4096,width:1080,height:1920,durationSeconds:14};
const pdf={id:'notice',kind:'document',format:'pdf',url:'/media/notice.pdf',name:'Admission <notice>.pdf',size:2048,pageCount:8};

test('video previews use local native controls without autoplay or image metadata claims',()=>{
 const html=mediaVisual(video,{controls:true});assert.match(html,/<video/);assert.match(html,/ controls/);assert.match(html,/playsinline/);assert.match(html,/preload="metadata"/);assert(!/autoplay|<img|Clean metadata|pixels verified/.test(html));assert.match(html,/Launch &lt;clip&gt;/);
 assert.equal(mediaTypeLabel(video),'Video');assert.equal(mediaFacts(video),'1080 × 1920 · 0:14 · 4 KB · MP4');
});
test('PDF previews show document identity, page count and an exact local review link',()=>{
 const html=documentPreview(pdf);assert.match(html,/PDF/);assert.match(html,/8 pages/);assert.match(html,/Admission &lt;notice&gt;\.pdf/);assert.match(html,/href="\/media\/notice.pdf"/);assert.match(html,/rel="noopener noreferrer"/);assert(!/<img|<video/.test(html));assert.equal(mediaFacts(pdf),'8 pages · 2 KB · PDF');
});
test('unsafe or external media links cannot become executable preview sources',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,<script>bad()</script>','https://evil.example/file.pdf','//evil.example/file.pdf','/\\evil.example/file.pdf','/media/file\n.pdf']){assert.equal(localMediaUrl(url),'',url);assert(!documentPreview({...pdf,url}).includes('href='),url);assert(!mediaVisual({...video,url}).includes('src="'+url+'"'),url);}
 assert.equal(localMediaUrl('blob:http://localhost:3000/fixture'),'blob:http://localhost:3000/fixture');
});
test('each video destination mockup retains the selected file while Instagram is visibly a Reel',()=>{
 for(const id of ['instagram','linkedin','x','youtubeDA','youtubeCS','whatsapp','telegram']){const html=platformPostPreview({id,account:'GO Classes',caption:'Reviewed caption',images:[video]});assert.match(html,/<video[^>]+src="\/media\/clip.mp4"/);assert(!html.includes('<img'));assert.match(html,/Reviewed caption/);if(id==='instagram')assert.match(html,/Reel/);}
});
test('LinkedIn and Telegram PDF mockups never render the PDF file as an image',()=>{
 for(const id of ['linkedin','telegram']){const html=platformPostPreview({id,account:'GO Classes',caption:'Reviewed attachment',images:[pdf]});assert.match(html,/data-document-preview/);assert.match(html,/8 pages/);assert(!/<img|<video/.test(html));if(id==='linkedin')assert.match(html,/Document carousel/);}
});
test('invalid mixed selections remain visible as their actual media types during review',()=>{
 const html=platformPostPreview({id:'linkedin',account:'GO',images:[video,{url:'/media/photo.png',name:'Photo'},pdf]});assert.match(html,/<video/);assert.match(html,/<img[^>]+src="\/media\/photo.png"/);assert(!html.includes('<img src="/media/notice.pdf"'));assert.match(html,/Admission &lt;notice&gt;/);
});
test('YouTube video preview shows the derived first-line title with its native title limit',()=>{
 const caption='\n\n<Admissions> announcement\n\nReviewed description';assert.equal(youtubePreviewTitle(caption),'Admissions announcement');assert.equal([...youtubePreviewTitle('🎓'.repeat(120))].length,100);const html=platformPostPreview({id:'youtubeDA',account:'GO',caption,images:[video]});assert.match(html,/data-youtube-preview-title>Admissions announcement<\/h3>/);assert.match(html,/Reviewed description/);
});
