// Copyright (c) 2026 Mrinal. All rights reserved.
// Container edits only: image payloads and colour-management data are retained.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import sharp from 'sharp';

export const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const pngRendering = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB', 'bKGD', 'pHYs', 'cICP', 'mDCV', 'cLLI']);
const webpRendering = new Set(['VP8X', 'VP8 ', 'VP8L', 'ALPH', 'ICCP']);
function chunks(buffer, format) {
  const result = [];
  if (format === 'png') {
    if (!buffer.subarray(0, 8).equals(PNG)) throw new Error('Invalid PNG header.');
    let offset = 8, ended = false;
    while (offset < buffer.length) {
      if (offset + 12 > buffer.length) throw new Error('Truncated PNG chunk.');
      const length = buffer.readUInt32BE(offset), end = offset + 12 + length;
      if (end > buffer.length) throw new Error('Truncated PNG data.');
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      result.push({ type, data: buffer.subarray(offset + 8, end - 4), raw: buffer.subarray(offset, end), keep: pngRendering.has(type) });
      offset = end;
      if (type === 'IEND') { ended = true; break; }
    }
    if (!ended) throw new Error('PNG end marker missing.');
  } else if (format === 'webp') {
    if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') throw new Error('Invalid WEBP header.');
    const end = buffer.readUInt32LE(4) + 8;
    if (end > buffer.length) throw new Error('Truncated WEBP data.');
    for (let offset = 12; offset < end;) {
      if (offset + 8 > end) throw new Error('Truncated WEBP chunk.');
      const length = buffer.readUInt32LE(offset + 4), next = offset + 8 + length + (length % 2);
      if (next > end) throw new Error('Truncated WEBP chunk data.');
      const type = buffer.toString('ascii', offset, offset + 4);
      result.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length), raw: buffer.subarray(offset, next), keep: webpRendering.has(type) });
      offset = next;
    }
  } else if (format === 'jpeg') {
    if (buffer.readUInt16BE(0) !== 0xffd8) throw new Error('Invalid JPEG header.');
    let offset = 2, ended = false;
    result.push({ type: 'SOI', data: Buffer.alloc(0), raw: buffer.subarray(0, 2), keep: true });
    while (offset < buffer.length) {
      const start = offset;
      if (buffer[offset++] !== 0xff) throw new Error('Invalid JPEG marker.');
      while (buffer[offset] === 0xff) offset++;
      const marker = buffer[offset++];
      if (marker === 0xd9) { result.push({ type: 'EOI', data: Buffer.alloc(0), raw: buffer.subarray(start, offset), keep: true }); ended = true; break; }
      if (offset + 2 > buffer.length) throw new Error('Truncated JPEG segment.');
      const length = buffer.readUInt16BE(offset), end = offset + length;
      if (length < 2 || end > buffer.length) throw new Error('Invalid JPEG segment length.');
      const data = buffer.subarray(offset + 2, end);
      const app = marker >= 0xe0 && marker <= 0xef;
      const keep = !app && marker !== 0xfe || marker === 0xe0 && data.subarray(0, 5).toString() === 'JFIF\0' || marker === 0xe2 && data.subarray(0, 12).toString() === 'ICC_PROFILE\0' || marker === 0xee && data.subarray(0, 5).toString() === 'Adobe';
      result.push({ type: app ? `APP${marker - 0xe0}` : marker === 0xfe ? 'COM' : `JPEG-${marker.toString(16)}`, data, raw: buffer.subarray(start, end), keep });
      offset = end;
      if (marker === 0xda) {
        const scan = offset;
        while (offset < buffer.length) {
          if (buffer[offset] !== 0xff) { offset++; continue; }
          let next = offset + 1;
          while (buffer[next] === 0xff) next++;
          if (buffer[next] === 0 || buffer[next] >= 0xd0 && buffer[next] <= 0xd7) { offset = next + 1; continue; }
          break;
        }
        result.push({ type: 'SCAN', data: buffer.subarray(scan, offset), raw: buffer.subarray(scan, offset), keep: true });
      }
    }
    if (!ended) throw new Error('JPEG end marker missing.');
  } else throw new Error('Choose a still JPG, PNG, or WEBP image.');
  return result;
}
function metadataText(chunk) {
  let data = chunk.data;
  try {
    if (chunk.type === 'zTXt') data = inflateSync(data.subarray(data.indexOf(0) + 2), { maxOutputLength: 262144 });
    if (chunk.type === 'iTXt') {
      const zero = data.indexOf(0), compressed = data[zero + 1];
      let start = zero + 3; start = data.indexOf(0, start) + 1; start = data.indexOf(0, start) + 1;
      data = compressed ? inflateSync(data.subarray(start), { maxOutputLength: 262144 }) : data.subarray(start);
    }
  } catch { /* Container presence is still reported if text cannot be decoded. */ }
  return data.toString('utf8');
}
export function inspectMetadata(buffer, metadata) {
  const parts = chunks(buffer, metadata.format), fields = parts.filter(chunk => !chunk.keep);
  const text = fields.map(metadataText).join('\n');
  const credentials = fields.some(chunk => ['caBX', 'C2PA'].includes(chunk.type) || /c2pa|jumb/iu.test(metadataText(chunk)));
  const aiMarkers = [...new Set(text.match(/trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|gpt-image|ChatGPT|OpenAI Media Service(?: API)?|c2pa\.watermarked\.unbound/giu) || [])];
  return { credentials, aiMarkers, signatureVerified: false, fields: [...new Set(fields.map(chunk => chunk.type))], metadataBytes: fields.reduce((sum, chunk) => sum + chunk.raw.length, 0), scan: 'Embedded container metadata only; not a pixel-watermark or AI-image detector.' };
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const value of data) { crc ^= value; for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
export function pngChunk(type, data) {
  const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); out.write(type, 4, 4, 'ascii'); data.copy(out, 8); out.writeUInt32BE(crc32(out.subarray(4, out.length - 4)), out.length - 4); return out;
}
function orientationExif(orientation) {
  const data = Buffer.alloc(26); data.write('II'); data.writeUInt16LE(42, 2); data.writeUInt32LE(8, 4); data.writeUInt16LE(1, 8);
  data.writeUInt16LE(0x112, 10); data.writeUInt16LE(3, 12); data.writeUInt32LE(1, 14); data.writeUInt16LE(orientation, 18); return data;
}
function webpChunk(type, data) {
  const out = Buffer.alloc(8 + data.length + data.length % 2); out.write(type, 0, 4, 'ascii'); out.writeUInt32LE(data.length, 4); data.copy(out, 8); return out;
}
function cleanedBytes(buffer, metadata) {
  const parts = chunks(buffer, metadata.format), retained = parts.filter(chunk => chunk.keep).map(chunk => chunk.raw);
  const orientation = metadata.orientation > 1 ? orientationExif(metadata.orientation) : null;
  if (metadata.format === 'png') {
    if (orientation) retained.splice(1, 0, pngChunk('eXIf', orientation));
    return Buffer.concat([PNG, ...retained]);
  }
  if (metadata.format === 'jpeg') {
    if (orientation) { const payload = Buffer.concat([Buffer.from('Exif\0\0'), orientation]), segment = Buffer.alloc(payload.length + 4); segment.writeUInt16BE(0xffe1); segment.writeUInt16BE(payload.length + 2, 2); payload.copy(segment, 4); retained.splice(1, 0, segment); }
    return Buffer.concat(retained);
  }
  if (orientation) retained.push(webpChunk('EXIF', orientation));
  const vp8x = retained.find(raw => raw.toString('ascii', 0, 4) === 'VP8X');
  if (vp8x) { const index = retained.indexOf(vp8x); retained[index] = Buffer.from(vp8x); retained[index][8] = retained[index][8] & ~0x0c | (orientation ? 0x08 : 0); }
  const body = Buffer.concat(retained), header = Buffer.alloc(12); header.write('RIFF'); header.writeUInt32LE(body.length + 4, 4); header.write('WEBP', 8); return Buffer.concat([header, body]);
}
const limits = { limitInputPixels: 80000000, animated: false };
export async function inspectImage(buffer) {
  const metadata = await sharp(buffer, limits).metadata();
  if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('Only still JPG, PNG, and WEBP images are supported.');
  const report = inspectMetadata(buffer, metadata);
  if (report.fields.some(type => ['acTL', 'ANIM', 'ANMF'].includes(type))) throw new Error('Only still JPG, PNG, and WEBP images are supported.');
  return { metadata, report, fileHash: sha256(buffer) };
}
export async function cleanImage(buffer) {
  const source = await inspectImage(buffer), output = cleanedBytes(buffer, source.metadata), checked = await inspectImage(output);
  const before = await sharp(buffer, limits).rotate().raw().toBuffer({ resolveWithObject: true });
  const after = await sharp(output, limits).rotate().raw().toBuffer({ resolveWithObject: true });
  const dimensionsEqual = source.metadata.width === checked.metadata.width && source.metadata.height === checked.metadata.height;
  const pixelsEqual = before.info.width === after.info.width && before.info.height === after.info.height && before.info.channels === after.info.channels && before.data.equals(after.data);
  const payload = (data, format) => Buffer.concat(chunks(data, format).filter(chunk => format === 'png' ? chunk.type === 'IDAT' : format === 'jpeg' ? chunk.type === 'SCAN' : ['VP8 ', 'VP8L', 'ALPH'].includes(chunk.type)).map(chunk => chunk.data));
  const payloadEqual = payload(buffer, source.metadata.format).equals(payload(output, source.metadata.format));
  if (!dimensionsEqual || !pixelsEqual || !payloadEqual || checked.report.credentials || checked.report.aiMarkers.length) throw new Error('Lossless metadata verification failed. The original image was preserved.');
  return { buffer: output, ...checked, sourceReport: source.report, verification: { dimensionsEqual, pixelsEqual, compressedPixelsUnchanged: payloadEqual, pixelHash: sha256(after.data), verifiedAt: new Date().toISOString(), metadataRescanned: true, orientationPreserved: source.metadata.orientation > 1, platformLabelPrediction: 'unknown' } };
}
export async function verifyMediaIntegrity(media, dataDir) {
  for (const item of media) {
    if (!item.fileHash) continue; // Older versions stored optimized JPGs without a source hash.
    const buffer = await fs.readFile(path.join(dataDir, 'uploads', item.filename));
    if (sha256(buffer) !== item.fileHash) throw new Error(`${item.name}: the image changed after review. Upload it again.`);
    if (item.verification) {
      const checked = await inspectImage(buffer);
      if (checked.report.credentials || checked.report.aiMarkers.length) throw new Error(`${item.name}: embedded origin metadata reappeared. Review the image again.`);
    }
  }
}
