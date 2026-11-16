import {usesInstagramAndroid} from './instagram.js';
import {instagramPostUrl,manychatPublicationSource} from './manychat.js';

export const executionLane=(run,item)=>usesInstagramAndroid(run.instagram,item.id)?'android':'browser';
const success=(run,item)=>item?.status==='posted'||run.mode==='TEST'&&item?.status==='dry_run';
const pending=new Set(['queued','running','waiting_for_input','awaiting_manual','attention']);
export function executionDependency(run,item){
 const result=(state,message='',dependsOn=[])=>({state,message,dependsOn});
 if(!['instagramMusic','instagramStory','manychat'].includes(item.id))return result('ready');
 const feed=run.items.find(i=>i.id==='instagram');
 if(feed&&!success(run,feed)){
  if(pending.has(feed.status))return result('waiting','Waiting for this run’s Instagram feed post.',[feed.id]);
  return result('blocked',"This run's Instagram feed did not finish successfully. Verify or retry that feed first. No earlier post was selected.",[feed.id]);
 }
 if(item.id==='instagramStory'){
  const music=run.items.find(i=>i.id==='instagramMusic');
  if(music&&!success(run,music)){
   if(pending.has(music.status))return result('waiting','Waiting for this post’s music to finish.',[music.id]);
   return result('blocked','Verify or finish this post’s music step before sharing its Story. The feed was not posted again.',[music.id]);
  }
 }
 if(run.mode==='TEST')return result('ready');
 const source=feed?.publication||run.sourceInstagramPublication;
 if(item.id==='manychat'&&!run.manychat?.postUrl&&manychatPublicationSource(source))return result('ready');
 const url=item.id==='manychat'?run.manychat?.postUrl||source?.postUrl:item.id==='instagramStory'?run.instagram?.story?.sourcePostUrl||source?.postUrl:source?.postUrl;
 if(!instagramPostUrl(url))return result('blocked',item.id==='manychat'?'ManyChat needs the exact confirmed Instagram post URL. No automation was activated.':'The exact feed-post permalink is not confirmed. Add or verify it before continuing this Instagram step.',feed?['instagram']:[]);
 return result('ready');
}

export function pipelineCandidates(run,occupied=new Set()){
 const eligible=run.items.filter(i=>i.status==='queued'&&executionDependency(run,i).state==='ready');
 const rank=i=>i.id==='instagram'?0:i.id==='manychat'?1:2;
 return ['android','browser'].filter(lane=>!occupied.has(lane)).map(lane=>eligible.filter(i=>executionLane(run,i)===lane).sort((a,b)=>rank(a)-rank(b))[0]).filter(Boolean);
}

export function pipelineContinuable(run,item){
 return item?.status==='attention'&&(!item.dependencyBlocked||executionDependency(run,item).state==='ready');
}
