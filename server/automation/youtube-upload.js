// Copyright (c) 2026 Mrinal. Studio uploads; Public is committed only by finishPost.
import {navigate,firstVisible,waitUntilReady,pasteCaption,verifyCaption,preparedButton,finishPost,InterventionError,AccountMismatchError} from './utils.js';
import {singleAttachment,uploadSingleAttachment,assertEmptyMediaEditor} from './media-posts.js';
import {isYouTubeShort} from '../../shared/media-capabilities.js';
export function youtubeVideoTitle(caption){return [...String(caption||'').split(/\r?\n/).find(line=>line.trim())?.trim()||''].slice(0,100).join('').replace(/[<>]/g,'').trim();}
function assertStudioChannel(page,channelId){const url=new URL(page.url());if(url.origin!=='https://studio.youtube.com'||!url.pathname.startsWith('/channel/'+channelId+'/')&&url.pathname!=='/channel/'+channelId)throw new AccountMismatchError('YouTube Studio did not open the reviewed channel. Switch to the configured channel before continuing.');}
async function oneVisible(scope,selector,label){const controls=scope.locator(selector).filter({visible:true});await controls.first().waitFor({state:'visible',timeout:60000});if(await controls.count()!==1)throw new InterventionError('YouTube has an ambiguous '+label+' control. Check the existing upload before continuing.');return controls;}
export function youtubeVideoUrl(value){try{const url=new URL(value);let id;if(url.protocol!=='https:'||url.port||url.username||url.password)return null;if(url.hostname==='youtu.be')id=url.pathname.slice(1);else if(['www.youtube.com','youtube.com'].includes(url.hostname))id=url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/shorts\/([\w-]+)\/?$/)?.[1];return /^[\w-]{11}$/.test(id||'')?'https://www.youtube.com/watch?v='+id:null;}catch{return null;}}
async function uploadReceipt(scope){return scope.locator('a[href]').evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>el.href)).then(urls=>[...new Set(urls.map(youtubeVideoUrl).filter(Boolean))]);}
export async function prepareYouTubeUpload(ctx){
 const media=singleAttachment(ctx,'video'),expected=ctx.config.platforms[ctx.id],{page,caption,step,snapshot}=ctx,title=youtubeVideoTitle(caption);
 if(!title)throw new InterventionError('Add a YouTube caption with a title on its first line.');
 await navigate(page,'https://studio.youtube.com/channel/'+expected.channelId,step);assertStudioChannel(page,expected.channelId);
 if(await page.locator('ytcp-uploads-dialog').filter({visible:true}).count())throw new InterventionError('YouTube already has an unfinished video upload. Close or finish that draft before starting a new upload.');
 await (await firstVisible([page.getByRole('button',{name:/^create$/i}),page.locator('#create-icon').filter({visible:true})])).click();
 await (await firstVisible([page.getByRole('menuitem',{name:/^upload videos$/i}),page.getByText('Upload videos',{exact:true})])).click();
 const uploader=page.locator('ytcp-uploads-dialog').filter({visible:true});await uploader.waitFor({state:'visible',timeout:60000});
 await assertEmptyMediaEditor(uploader,'YouTube');
 await uploadSingleAttachment(page,uploader,ctx,'video',[uploader.getByRole('button',{name:/^select files$/i})]);
 const titleEditor=await oneVisible(uploader,'#title-textarea #textbox[contenteditable="true"],#title-textarea textarea','title');
 const description=await oneVisible(uploader,'#description-textarea #textbox[contenteditable="true"],#description-textarea textarea','description');
 await pasteCaption(page,titleEditor,title);await pasteCaption(page,description,caption);
 const audience=await firstVisible([uploader.getByRole('radio',{name:/^no,? it.?s not made for kids/i}),uploader.locator('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]')]);
 await audience.click();
 const reviewedTitle=await titleEditor.elementHandle(),reviewedDescription=await description.elementHandle(),reviewedAudience=await audience.elementHandle();
 const checkDetails=async()=>{assertStudioChannel(page,expected.channelId);if(!await reviewedTitle.evaluate(el=>el.isConnected)||!await reviewedDescription.evaluate(el=>el.isConnected)||!await reviewedAudience.evaluate(el=>el.isConnected))throw new InterventionError('The reviewed YouTube details are no longer available. Review the private upload before continuing.');await verifyCaption(reviewedTitle,title);await verifyCaption(reviewedDescription,caption);if(!await reviewedAudience.evaluate(el=>el.getAttribute('aria-checked')==='true'||el.checked===true||el.hasAttribute('checked')))throw new InterventionError('YouTube audience settings changed. Review the upload before continuing.');};
 await checkDetails();await snapshot('video-details-prepared',uploader);
 // Details -> Video elements -> Checks -> Visibility. Only Next is allowed.
 for(let stage=0;stage<4;stage++){
  if(await uploader.getByRole('radio',{name:'Public',exact:true}).isVisible().catch(()=>false))break;
  const next=uploader.locator('#next-button').filter({visible:true});await preparedButton(page,next);await next.click();
 }
 const publicOption=uploader.getByRole('radio',{name:'Public',exact:true});await publicOption.waitFor({state:'visible',timeout:60000});await publicOption.click();
 const publish=uploader.locator('#done-button').filter({visible:true});await preparedButton(page,publish);
 await waitUntilReady(page,async()=>{
  const text=await uploader.innerText();
  if(/(?:upload failed|processing abandoned|file is a duplicate|video is too long|daily upload limit)/i.test(text))throw new InterventionError('YouTube could not prepare this video. Review its upload status; nothing was published.');
  return !await uploader.locator('[role="progressbar"]').filter({visible:true}).count()&&!/uploading\s+\d+%|uploading your video/i.test(text);
 },{timeout:180000,message:'YouTube is still uploading or processing this video. Keep the private draft open; nothing was published.'});
 const receipts=await uploadReceipt(uploader);if(receipts.length!==1)throw new InterventionError('YouTube did not provide one exact video link for this upload. Inspect the private draft before continuing.');const postUrl=receipts[0];
 await ctx.recordPreparation?.({kind:'video',format:isYouTubeShort(media)?'short':'video',title,postUrl,privateDraft:true});
 const preflight=async()=>{
  await checkDetails();
  if(await publicOption.getAttribute('aria-checked')!=='true'&&!await publicOption.evaluate(el=>el.checked===true||el.hasAttribute('checked')))throw new InterventionError('YouTube visibility changed. Nothing was published.');
  if((await uploadReceipt(uploader)).join()!==postUrl)throw new InterventionError('The YouTube video link changed before publication. Nothing was published.');
  const names=await uploader.locator('input[type="file"]').evaluateAll(inputs=>inputs.flatMap(input=>[...input.files||[]].map(file=>({name:file.name,size:file.size}))));
  if(names.length&&(names.length!==1||names[0].size!==media.size))throw new InterventionError('The YouTube attachment changed before publication. Nothing was published.');
  await preparedButton(page,publish);
 };
 const status=await finishPost({...ctx,preflight,publish:()=>publish.click(),verify:()=>waitUntilReady(page,async()=>{
  const confirmed=page.locator('ytcp-video-share-dialog').filter({visible:true});
  if(await confirmed.count()!==1)return null;
  const urls=await uploadReceipt(confirmed);return urls.includes(postUrl)&&/published|now public|video published/i.test(await confirmed.innerText());
 },{timeout:60000,message:'YouTube publication has not been confirmed for this exact video. Verify it before retrying; Publish was not repeated.'})});
 if(status==='dry_run')await step('TEST prepared a private YouTube upload. Publish was not clicked; its private draft may remain in Studio.');
 return {status,...(status==='posted'?{publication:{postUrl,kind:isYouTubeShort(media)?'short':'video',title}}:{})};
}
