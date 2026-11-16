// Only unambiguous poster role prefixes change upload order. Manual reorders win.
export function posterPosition(name){
 const text=String(name||'').normalize('NFKC');let m=text.match(/^(\d{1,3})[ _.-]+(cover|slide)(?:[ _.-]|$)/i);
 if(m)return {index:Number(m[1]),cover:m[2].toLowerCase()==='cover'};
 if(/^cover[ _.-]/i.test(text))return {index:0,cover:true};
 m=text.match(/^slide[ _.-]+(\d{1,3})(?:[ _.-]|$)/i);return m?{index:Number(m[1]),cover:false}:null;
}
export function orderPosterFiles(files){
 const rows=[...files].map((file,index)=>({file,index,position:posterPosition(file.name||file.originalname)}));
 if(rows.length<2||rows.some(r=>!r.position)||new Set(rows.map(r=>r.position.index)).size!==rows.length||rows.filter(r=>r.position.cover).length!==1)return [...files];
 return rows.sort((a,b)=>Number(b.position.cover)-Number(a.position.cover)||a.position.index-b.position.index).map(r=>r.file);
}
