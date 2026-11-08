// Copyright (c) 2026 Mrinal. Inspect attachments without converting their bytes.
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import ffprobe from '@ffprobe-installer/ffprobe';
import {PDFDocument} from 'pdf-lib';
import {inspectImage} from './image-metadata.js';
import {UPLOAD_LIMITS} from '../shared/media-capabilities.js';
const exec=promisify(execFile);
const mimeTypes={image:['image/jpeg','image/png','image/webp'],video:['video/mp4','video/quicktime'],document:['application/pdf']};
export const acceptedUploadType=(file)=>['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','application/pdf','application/octet-stream'].includes(file.mimetype)||!file.mimetype;
export async function hashMediaFile(filename){const hash=createHash('sha256');for await(const part of createReadStream(filename))hash.update(part);return hash.digest('hex');}
export async function inspectVideo(filename,{probe=exec}={}){
 const {stdout}=await probe(ffprobe.path,['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',filename],{windowsHide:true,timeout:20000,maxBuffer:2*1024*1024});
 let report;try{report=JSON.parse(stdout);}catch{throw Error('The video could not be inspected. Export a standard H.264 MP4 and upload it again.');}
 const videos=(report.streams||[]).filter(s=>s.codec_type==='video'&&!s.disposition?.attached_pic),audio=(report.streams||[]).filter(s=>s.codec_type==='audio');
 if(videos.length!==1||!String(report.format?.format_name||'').split(',').includes('mov'))throw Error('Use a single-track MP4 or MOV video.');
 const video=videos[0],durationSeconds=Number(video.duration||report.format?.duration),rotation=Number(video.side_data_list?.find(s=>Number.isFinite(Number(s.rotation)))?.rotation??video.tags?.rotate??0),swapped=Math.abs(rotation)%180===90;
 const width=Number(swapped?video.height:video.width),height=Number(swapped?video.width:video.height);
 if(video.codec_name!=='h264'||audio.some(s=>s.codec_name!=='aac'))throw Error('Use H.264 video with AAC audio (or no audio) in MP4/MOV format. The original file is kept without conversion.');
 if(!Number.isFinite(durationSeconds)||durationSeconds<=0||durationSeconds>900||!Number.isInteger(width)||!Number.isInteger(height)||width<32||height<32||width>8192||height>8192)throw Error('Use a video up to 15 minutes long with valid dimensions between 32 and 8192 pixels.');
 const [n,d]=(video.avg_frame_rate||'0/1').split('/').map(Number),frameRate=d?n/d:0;
 return {width,height,durationSeconds,videoCodec:video.codec_name,audioCodec:audio[0]?.codec_name||null,frameRate:Number.isFinite(frameRate)?frameRate:0,rotation};
}
export async function inspectUpload(file){
 const stat=await fs.stat(file.path),handle=await fs.open(file.path,'r');let head;try{const buffer=Buffer.alloc(64),read=await handle.read(buffer,0,64,0);head=buffer.subarray(0,read.bytesRead);}finally{await handle.close();}
 const kind=head.subarray(0,5).toString()==='%PDF-'?'document':head.subarray(4,8).toString()==='ftyp'?'video':'image';
 if(!stat.size||stat.size>UPLOAD_LIMITS[kind]){const error=Error(`Use ${kind==='document'?'a PDF':kind==='video'?'a video':'an image'} up to ${Math.round(UPLOAD_LIMITS[kind]/1024/1024)} MB.`);if(stat.size>UPLOAD_LIMITS[kind])error.status=413;throw error;}
 if(file.mimetype&&file.mimetype!=='application/octet-stream'&&!mimeTypes[kind].includes(file.mimetype))throw Error('The file contents do not match its declared type. Upload the original image, MP4/MOV, or PDF.');
 if(kind==='image'){
  const checked=await inspectImage(await fs.readFile(file.path)),{metadata}=checked;
  return {kind,format:metadata.format,mimeType:metadata.format==='jpeg'?'image/jpeg':`image/${metadata.format}`,width:metadata.width,height:metadata.height,size:stat.size,fileHash:checked.fileHash,metadata:checked.report};
 }
 if(kind==='document'){
  let document;try{document=await PDFDocument.load(await fs.readFile(file.path),{ignoreEncryption:false,updateMetadata:false,throwOnInvalidObject:true});}catch{throw Error('This PDF is invalid or password protected. Upload an unencrypted PDF.');}
  const pageCount=document.getPageCount();if(pageCount<1||pageCount>1000)throw Error('Use a PDF containing between 1 and 1,000 pages.');
  return {kind,format:'pdf',mimeType:'application/pdf',pageCount,size:stat.size,fileHash:await hashMediaFile(file.path)};
 }
 let video;try{video=await inspectVideo(file.path);}catch(error){if(error.killed||error.code==='ETIMEDOUT')throw Error('This video took too long to inspect. Export an H.264 MP4 and try again.');if(error.code==='ENOENT')throw Error('The video inspector is missing. Run npm install, then upload again.');throw error;}
 return {kind,format:head.subarray(8,12).toString()==='qt  '?'mov':'mp4',mimeType:head.subarray(8,12).toString()==='qt  '?'video/quicktime':'video/mp4',size:stat.size,fileHash:await hashMediaFile(file.path),...video};
}
