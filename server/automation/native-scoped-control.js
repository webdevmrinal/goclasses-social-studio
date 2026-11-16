// Resolve labels and Compose wrapper buttons inside a caller-verified scene.
// This module does not execute actions or infer that a publication succeeded.
import {nativeBounds,nativeId,xpathLiteral} from './android-native.js';
import {InterventionError} from './utils.js';
const own=nodes=>nodes.filter(n=>n.displayed==='true'&&n.package==='com.instagram.android');
const box=node=>{try{return nativeBounds(node);}catch{return null;}};
const contains=(outer,inner)=>outer&&inner&&inner.width>0&&inner.height>0&&inner.x>=outer.x&&inner.y>=outer.y&&inner.x+inner.width<=outer.x+outer.width&&inner.y+inner.height<=outer.y+outer.height;
export function scopedNativeControl(nodes,{guard,resources=[],labels=[],allowLocalDone=false}={}){
 if(typeof guard!=='function'||!guard(nodes)||nodes.some(n=>n.displayed==='true'&&n.password==='true'))throw new InterventionError('The expected navigation scene changed. Its draft was preserved.');
 const current=own(nodes),matches=node=>resources.some(id=>[id,nativeId(id)].includes(node['resource-id']))||labels.some(label=>node.text===label||node['content-desc']===label);
 const anchors=current.filter(matches),candidates=[];
 for(const anchor of anchors){
  let choices;
  if(anchor.clickable==='true'&&anchor.enabled==='true')choices=[anchor];
  else{
   const parent=box(anchor);
   // A renamed Compose wrapper often has an unlabeled Button child. Only
   // clickable descendants bounded by that observed anchor are eligible.
   choices=current.filter(n=>n.clickable==='true'&&n.enabled==='true'&&/Button$/.test(n.class||n.tag||'')&&contains(parent,box(n)));
   if(!choices.length&&parent){
    const enclosing=current.filter(n=>{const b=box(n);return n.clickable==='true'&&n.enabled==='true'&&contains(b,parent)&&b.width<=parent.width*1.8+24&&b.height<=parent.height*1.8+24;});
    const area=n=>{const b=box(n);return b.width*b.height;},smallest=Math.min(...enclosing.map(area));
    choices=enclosing.filter(n=>area(n)===smallest);
   }
  }
  candidates.push(...choices);
 }
 const distinct=[...new Map(candidates.map(n=>[JSON.stringify([n['resource-id'],n.bounds,n.class,n.text,n['content-desc']]),n])).values()];
 const safe=distinct.filter(n=>{
  if(/EditText|SeekBar|CheckBox|Switch/.test(n.class||n.tag||''))return false;
  if(/(?:^|[/:_])(?:save|share|post|publish|send|delete|discard|remove|recipient)(?:[/:_]|$)/i.test(n['resource-id']||''))return false;
  const names=[n.text,n['content-desc']].filter(Boolean);
  return names.every(v=>!/(?:^|\b)(?:save|share|post|publish|send|delete|discard|remove|your stor(?:y|ies)|close friends)(?:\b|$)/i.test(v))&&(allowLocalDone||names.every(v=>!/^Done$/i.test(v)));
 });
 if(!safe.length)return null;
 if(safe.length!==1)throw new InterventionError('More than one navigation control matched. The draft was preserved.');
 const node=safe[0],attributes={package:'com.instagram.android',displayed:'true',enabled:'true',clickable:'true',bounds:node.bounds};
 for(const key of ['resource-id','class','text','content-desc'])if(typeof node[key]==='string')attributes[key]=node[key];
 return {using:'xpath',value:'//*['+Object.entries(attributes).map(([k,v])=>'@'+k+'='+xpathLiteral(v)).join(' and ')+']'};
}
