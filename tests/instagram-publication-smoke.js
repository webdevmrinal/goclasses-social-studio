// Copyright (c) 2026 Mrinal. Offline Instagram fixtures only; no public action.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {instagramBaseline,instagramPublication,instagramCaptionMatches} from '../server/automation/instagram-reference.js';

const browser=await chromium.launch({headless:true}),context=await browser.newContext();
const caption='Admission details & dates\n\nApply at https://example.com/apply';let fresh=false,wrong=false;
const picture='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="blue"/></svg>');
await context.route('**/*',route=>{
 const u=new URL(route.request().url());
 if(u.hostname!=='www.instagram.com')return route.abort();
 if(u.pathname==='/goclasses_cse/')return route.fulfill({contentType:'text/html',body:'<main><a href="/p/OLD/"><img src="'+picture+'" alt="Pinned"></a>'+(fresh?'<a href="/p/NEW/"><img src="'+picture+'" alt="Generated image description"></a>':'')+'</main>'});
 const text=wrong?'Changed caption':caption;
 return route.fulfill({contentType:'text/html',body:'<main><div><a href="/goclasses_cse/">goclasses_cse</a></div><span dir="auto" id="caption">Admission details</span><button id="more">more</button></main><script>document.getElementById("more").onclick=()=>{document.getElementById("caption").textContent='+JSON.stringify(text)+';document.getElementById("more").remove();};</script>'});
});
try{
 const baseline=await instagramBaseline(context,'goclasses_cse');fresh=true;
 const proof=await instagramPublication(context,'goclasses_cse',baseline,caption);
 assert.equal(proof.postUrl,'https://www.instagram.com/p/NEW/');
 const page=await context.newPage();await page.goto(proof.postUrl);assert(await instagramCaptionMatches(page,caption));
 wrong=true;await page.goto(proof.postUrl);assert.equal(await instagramCaptionMatches(page,caption),false);
 console.log('Instagram web publication fixtures passed: new permalink detection, generated alt text, expanded caption markup and changed-caption rejection.');
}finally{await browser.close();}
