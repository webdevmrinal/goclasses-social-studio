// Total wall time includes login checks, preparation and operator pauses.
export function runTiming(run,now=Date.now()){
 const start=Date.parse(run?.createdAt||'');if(!Number.isFinite(start))return null;
 const terminal=['completed','completed_with_errors','stopped','interrupted'].includes(run.status);
 const finished=Date.parse(run.finishedAt||'');
 const fallback=Math.max(start,...(run.items||[]).map(i=>Date.parse(i.finishedAt||'')).filter(Number.isFinite));
 const end=Number.isFinite(finished)?finished:terminal?fallback:null;
 return {start:new Date(start).toISOString(),end:end===null?'':new Date(Math.max(start,end)).toISOString(),durationMs:Math.max(0,(end??now)-start)};
}
