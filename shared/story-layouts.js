// Copyright (c) 2026 Mrinal. Story presets use the same normalized placements as native posting.
import {DEFAULT_STORY_LAYOUT,storyLayout} from './instagram.js';
export const STORY_PRESETS=Object.freeze([
 {id:'signature',name:'Signature',width:.8,x:.5,y:.43,linkX:.5,linkY:.81},
 {id:'gallery',name:'Gallery',width:.86,x:.5,y:.46,linkX:.5,linkY:.84},
 {id:'spotlight',name:'Spotlight',width:.64,x:.5,y:.39,linkX:.5,linkY:.73},
 {id:'left-bank',name:'Left bank',width:.68,x:.39,y:.43,linkX:.61,linkY:.79},
 {id:'right-bank',name:'Right bank',width:.68,x:.61,y:.43,linkX:.39,linkY:.79},
 {id:'high-note',name:'High note',width:.72,x:.5,y:.34,linkX:.5,linkY:.83},
 {id:'grounded',name:'Grounded',width:.68,x:.5,y:.55,linkX:.5,linkY:.85},
 {id:'pocket',name:'Pocket',width:.5,x:.33,y:.35,linkX:.6,linkY:.74}
]);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
// Dimensions are measured from the actual mockup, including its author/caption chrome.
// Tall artwork scales down before placement rather than slipping under Story controls.
export function storyPresetLayout(id,{hasLink=true,imageAspect=1,chromeHeight=.12}={}){
 const preset=STORY_PRESETS.find(p=>p.id===id);if(!preset)throw new Error('Unknown Story layout.');
 const aspect=Number.isFinite(imageAspect)&&imageAspect>0?imageAspect:1;
 const chrome=clamp(chromeHeight,.02,.3),maxHeight=hasLink?Math.min(.62,preset.linkY-.085-.12):.7;
 const width=clamp(Math.min(preset.width,(maxHeight-chrome)*aspect*16/9),.45,.88);
 const height=width*9/16/aspect+chrome;
 const minY=Math.max(.26,.12+height/2),maxY=Math.min(.62,.9-height/2,hasLink?preset.linkY-.085-height/2:1);
 if(minY>maxY+1e-9)throw new Error('This artwork is too tall for this Story layout. Use a wider crop or Custom placement.');
 return storyLayout({card:{x:clamp(preset.x,width/2+.02,1-width/2-.02),y:clamp(preset.y,minY,maxY),width},link:{x:preset.linkX,y:preset.linkY,width:.66}});
}
export function selectedStoryPreset(story={}){
 if(story.layoutPreset==='custom')return 'custom';
 if(STORY_PRESETS.some(p=>p.id===story.layoutPreset))return story.layoutPreset;
 return JSON.stringify(story.layout||DEFAULT_STORY_LAYOUT)===JSON.stringify(DEFAULT_STORY_LAYOUT)?'signature':'custom';
}
