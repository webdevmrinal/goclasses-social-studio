import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';import sharp from 'sharp';
import {uploadOrderedImages,verifyOrderedImages} from '../server/automation/ordered-images.js';
let browser;before(async()=>{browser=await chromium.launch({headless:true});});after(async()=>{await browser?.close();});
async function fixture(t){const context=await browser.newContext();t.after(()=>context.close());const page=await context.newPage();await page.route('**/*',r=>r.abort());await page.setContent('<input type="file" multiple><div id="photos" style="display:flex"></div><script>window.names=[];document.querySelector("input").onchange=e=>{for(const file of e.target.files){window.names.push(file.name);setTimeout(()=>{const img=new Image();img.src=URL.createObjectURL(file);document.querySelector("#photos").append(img);},file.name.startsWith("01")?150:0);}}</script>');const files=await Promise.all(['#e11c35','#177cef'].map(async color=>({name:'random-name.png',mimeType:'image/png',buffer:await sharp({create:{width:160,height:120,channels:3,background:color}}).png().toBuffer()})));return {page,files,images:page.locator('#photos img'),input:page.locator('input')};}
test('asynchronous uploads are serialized with ordered names and unchanged bytes',async t=>{
 const f=await fixture(t),proof=await uploadOrderedImages(f.page,f.files,async()=>{},f);assert.deepEqual(await f.page.evaluate(()=>window.names),['01_cover.png','02_slide.png']);assert.deepEqual(proof.sources.map(s=>s.payload.buffer),f.files.map(f=>f.buffer));await verifyOrderedImages(f.page,f.images,proof.sources,proof.evidence);
});
test('a swapped or replaced preview cannot pass the final order check',async t=>{
 const f=await fixture(t),proof=await uploadOrderedImages(f.page,f.files,async()=>{},f);await f.page.locator('#photos').evaluate(el=>el.prepend(el.lastElementChild));await assert.rejects(verifyOrderedImages(f.page,f.images,proof.sources,proof.evidence),/order or content/);
});
test('an occupied composer and a cancelled upload do not overwrite or append files',async t=>{
 const f=await fixture(t);await uploadOrderedImages(f.page,[f.files[0]],async()=>{},f);await assert.rejects(uploadOrderedImages(f.page,f.files,async()=>{},f),/existing draft/);assert.equal(await f.page.evaluate(()=>window.names.length),1);const controller=new AbortController();controller.abort();await assert.rejects(uploadOrderedImages(f.page,f.files,async()=>{},{...f,signal:controller.signal}),{name:'AbortError'});
});
