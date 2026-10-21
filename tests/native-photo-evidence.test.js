// Copyright (c) 2026 Mrinal. Generated image fixtures only; no Android or real photos.
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {photoEvidence} from '../server/automation/native-photos.js';
import {nativeId} from '../server/automation/android-native.js';
import {InterventionError} from '../server/automation/utils.js';

const node=(name,bounds,extra={})=>({'resource-id':nativeId(name),package:'com.instagram.android',displayed:'true',bounds,...extra});
const bounds=([left,top,right,bottom])=>'['+left+','+top+']['+right+','+bottom+']';
function drawPhoto(pixels,{width,channels},box,seed){
  const [left,top,right,bottom]=box;
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
    const offset=(y*width+x)*channels;
    for(let c=0;c<3;c++)pixels[offset+c]=(seed+(x-left)*(7+c)+(y-top)*(11+c*2)+c*53)%256;
    if(channels===4)pixels[offset+3]=255;
  }
}
function fixture(width=540,channels=3){
  const scale=value=>Math.round(value*width/540),height=scale(780),gutter=Math.ceil(width/90);
  const first=[scale(28),scale(138),scale(376),scale(486)],second=[scale(384),scale(138),width,scale(486)];
  const viewport=[0,scale(100),width,scale(520)],pixels=Buffer.alloc(width*height*channels,21);
  if(channels===4)for(let offset=3;offset<pixels.length;offset+=4)pixels[offset]=255;
  const info={width,height,channels};drawPhoto(pixels,info,first,37);drawPhoto(pixels,info,second,149);
  const nodes=[node('scroll_view',bounds(viewport)),node('photo_media_preview_image_view',bounds(first)),node('photo_media_preview_image_view',bounds(second))];
  return {...info,gutter,first,second,viewport,pixels,nodes};
}
async function evidence(f,{pixels=f.pixels,nodes=f.nodes}={}){
  const png=await sharp(pixels,{raw:{width:f.width,height:f.height,channels:f.channels}}).png().toBuffer();
  return photoEvidence({screen:async()=>structuredClone(nodes),screenshot:async()=>png});
}

for(const width of [540,720])for(const channels of [3,4]){
  test('exact '+channels+'-channel photo evidence at '+width+'px tolerates only its scaled UI gutter',async()=>{
    const f=fixture(width,channels),original=await evidence(f),gutterPixels=Buffer.from(f.pixels);
    assert.equal(f.gutter,width===540?6:8);assert.equal(original.length,2);
    assert.deepEqual(original.map(picture=>picture.bounds),[bounds(f.first),bounds(f.second)]);
    assert.equal(original[0].contentBounds,bounds(f.first));
    assert.equal(original[1].contentBounds,bounds([f.second[0],f.second[1],width-f.gutter,f.second[3]]));
    for(const picture of original)assert.match(picture.hash,/^[a-f0-9]{64}$/);
    // Reproduce the fading scrollbar: every pixel in the rightmost 6/8px changes.
    for(let y=f.second[1];y<f.second[3];y++)for(let x=width-f.gutter;x<width;x++){
      const offset=(y*width+x)*channels;
      for(let c=0;c<3;c++)gutterPixels[offset+c]=255-gutterPixels[offset+c];
    }
    assert.notDeepEqual(gutterPixels,f.pixels);
    assert.deepEqual(await evidence(f,{pixels:gutterPixels}),original);
    // One pixel immediately inside the retained content must still invalidate it.
    const changedContent=Buffer.from(gutterPixels),x=width-f.gutter-1,y=f.second[1]+20;
    changedContent[(y*width+x)*channels]^=1;
    const changed=await evidence(f,{pixels:changedContent});
    assert.deepEqual(changed[0],original[0]);assert.equal(changed[1].contentBounds,original[1].contentBounds);
    assert.notEqual(changed[1].hash,original[1].hash);assert.notDeepEqual(changed,original);
  });
}

test('swapped image content, review order, photo count and original bounds all change the proof',async()=>{
  const f=fixture(540,4),original=await evidence(f),swappedPixels=Buffer.from(f.pixels);
  drawPhoto(swappedPixels,f,f.first,149);drawPhoto(swappedPixels,f,f.second,37);
  const swapped=await evidence(f,{pixels:swappedPixels});
  assert.deepEqual(swapped.map(picture=>picture.bounds),original.map(picture=>picture.bounds));
  assert(swapped.every((picture,index)=>picture.hash!==original[index].hash));assert.notDeepEqual(swapped,original);
  const reversed=await evidence(f,{nodes:[f.nodes[0],f.nodes[2],f.nodes[1]]});
  assert.deepEqual(reversed,[original[1],original[0]]);assert.notDeepEqual(reversed,original);
  const fewer=await evidence(f,{nodes:f.nodes.slice(0,2)});
  assert.equal(fewer.length,1);assert.notDeepEqual(fewer,original);
  const more=await evidence(f,{nodes:[...f.nodes,node('photo_media_preview_image_view','[10,110][20,120]')]});
  assert.equal(more.length,3);assert.notDeepEqual(more,original);
  // Bounds remain part of the proof even when clipping leaves identical pixels.
  const extended=structuredClone(f.nodes);extended[2].bounds=bounds([f.second[0],f.second[1],f.width+1,f.second[3]]);
  const moved=await evidence(f,{nodes:extended});
  assert.equal(moved[1].hash,original[1].hash);assert.equal(moved[1].contentBounds,original[1].contentBounds);
  assert.notEqual(moved[1].bounds,original[1].bounds);assert.notDeepEqual(moved,original);
});

test('missing, hidden, foreign or duplicate review viewports stop before reading a screenshot',async()=>{
  const f=fixture(),invalid=[f.nodes.slice(1),[{...f.nodes[0],displayed:'false'},...f.nodes.slice(1)],[{...f.nodes[0],package:'com.other.app'},...f.nodes.slice(1)],[f.nodes[0],{...f.nodes[0]},...f.nodes.slice(1)]];
  for(const nodes of invalid)await assert.rejects(photoEvidence({screen:async()=>nodes,screenshot:async()=>assert.fail('No screenshot should be read without a unique visible Instagram viewport')}),error=>error instanceof InterventionError&&/viewport is unavailable or ambiguous/.test(error.message));
});

test('hidden and foreign duplicate viewports or photos do not become review evidence',async()=>{
  const f=fixture(),original=await evidence(f),nodes=[...f.nodes,{...f.nodes[0],displayed:'false'},{...f.nodes[0],package:'com.other.app'},{...f.nodes[1],displayed:'false'},{...f.nodes[2],package:'com.other.app'}];
  assert.deepEqual(await evidence(f,{nodes}),original);
});

test('no visible photos, wholly clipped photos and tiny review viewports stop verification',async()=>{
  const f=fixture();
  for(const nodes of [[f.nodes[0]],[f.nodes[0],{...f.nodes[1],displayed:'false'}],[f.nodes[0],node('photo_media_preview_image_view',bounds([f.width+1,150,f.width+20,200]))]]){
    await assert.rejects(evidence(f,{nodes}),error=>error instanceof InterventionError&&/image preview is unavailable/.test(error.message));
  }
  for(const width of [540,720]){
    const sized=fixture(width),tiny=structuredClone(sized.nodes);tiny[0].bounds=bounds([0,sized.viewport[1],sized.gutter*2,sized.viewport[3]]);
    await assert.rejects(evidence(sized,{nodes:tiny}),error=>error instanceof InterventionError&&/too small to verify/.test(error.message));
  }
});
