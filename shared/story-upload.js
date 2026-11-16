// Read-only upload status. A progress bar is never a publication receipt.
export function storyUploadState(nodes){
 const own=nodes.filter(n=>n.displayed==='true'&&n.package==='com.instagram.android');
 if(own.some(n=>/^(?:couldn['\u2019]t (?:upload|share)(?: your story)?|(?:story )?upload failed|story (?:was not|wasn['\u2019]t) shared)[.!\s]*$/i.test(n.text||'')))return {state:'failed'};
 const active=own.filter(n=>/^(?:uploading|sharing|posting|sending)(?:[ .:\u2026]|$)/i.test(n.text||'')||/(?:your story|your stories).*\b(?:uploading|sharing|posting)\b/i.test(n['content-desc']||'')||/(?:story|reel).*(?:upload_progress|uploading|uploader)|upload.*(?:story|reel)/i.test(n['resource-id']||''));
 const progress=own.filter(n=>/^(?:\d{1,3})\s*%$/.test(n.text||'')||/ProgressBar$/.test(n.class||n.tag||''));
 if(!active.length&&!progress.length)return null;
 const percent=[...active,...progress].map(n=>(n.text+' '+(n['content-desc']||'')).match(/\b(\d{1,3})\s*%/)).filter(Boolean).map(m=>Number(m[1])).find(n=>n>=0&&n<=100);
 return {state:'uploading',...(percent!==undefined?{percent}:{})};
}
