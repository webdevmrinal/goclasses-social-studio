// Copyright (c) 2026 Mrinal. Synthetic fixtures; no image is published.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { cleanImage, inspectImage, pngChunk, verifyMediaIntegrity, sha256 } from '../server/image-metadata.js';
import { finishPost } from '../server/automation/utils.js';

test('PNG cleaning removes C2PA and text without changing pixels, alpha, size or compressed image data', async () => {
  const source = await sharp({ create: { width: 71, height: 43, channels: 4, background: '#3578aa80' } }).png().toBuffer();
  const original = Buffer.concat([source.subarray(0, 33), pngChunk('caBX', Buffer.from('jumb c2pa ChatGPT gpt-image trainedAlgorithmicMedia c2pa.watermarked.unbound')), pngChunk('tEXt', Buffer.from('Author\0private-name')), ...[source.subarray(33)]]);
  const report = (await inspectImage(original)).report; assert(report.credentials); assert(report.aiMarkers.includes('ChatGPT'));
  const cleaned = await cleanImage(original);
  assert.equal(cleaned.metadata.width, 71); assert.equal(cleaned.metadata.height, 43); assert.equal(cleaned.metadata.channels, 4);
  assert.equal(cleaned.report.credentials, false); assert.deepEqual(cleaned.report.aiMarkers, []);
  assert(!cleaned.report.fields.includes('tEXt')); assert(cleaned.verification.compressedPixelsUnchanged); assert(cleaned.verification.pixelsEqual);
  assert.equal(cleaned.verification.platformLabelPrediction, 'unknown');
  assert(original.includes(Buffer.from('ChatGPT')), 'The original buffer is not edited');
});

for (const format of ['jpeg', 'webp']) test(`${format} strips EXIF/XMP while retaining colour, orientation and identical rendered pixels`, async () => {
  const source = await sharp({ create: { width: 47, height: 31, channels: 3, background: '#a457c2' } }).withMetadata({ orientation: 6, exif: { IFD0: { Artist: 'Private author', ImageDescription: 'ChatGPT generated illustration' } } }).toFormat(format).toBuffer();
  const checked = await inspectImage(source); assert(checked.report.fields.length);
  const cleaned = await cleanImage(source);
  assert.equal(cleaned.metadata.width, 47); assert.equal(cleaned.metadata.height, 31); assert.equal(cleaned.metadata.orientation, 6);
  assert(cleaned.verification.pixelsEqual); assert(cleaned.verification.compressedPixelsUnchanged);
  assert(!cleaned.buffer.includes(Buffer.from('Private author'))); assert(!cleaned.buffer.includes(Buffer.from('ChatGPT')));
});

test('progressive JPEG scans and colour profile survive metadata cleaning', async () => {
  const source = await sharp({ create: { width: 113, height: 67, channels: 3, background: '#3f579a' } }).withMetadata().jpeg({ progressive: true }).toBuffer();
  const cleaned = await cleanImage(source); assert(cleaned.verification.pixelsEqual); assert(cleaned.verification.compressedPixelsUnchanged);
  assert((await sharp(cleaned.buffer).metadata()).icc.equals((await sharp(source).metadata()).icc));
});

test('corrupt image containers are rejected and reviewed-file changes block the queue', async () => {
  const source = await sharp({ create: { width: 9, height: 9, channels: 3, background: '#006699' } }).png().toBuffer();
  await assert.rejects(cleanImage(source.subarray(0, source.length - 5)), /truncated|end|corrupt|invalid/i);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mrinal-metadata-')); await fs.mkdir(path.join(dir, 'uploads'));
  await fs.writeFile(path.join(dir, 'uploads', 'image.png'), source);
  const media = [{ name: 'image.png', filename: 'image.png', fileHash: sha256(source) }];
  await verifyMediaIntegrity(media, dir); await fs.appendFile(path.join(dir, 'uploads', 'image.png'), 'changed');
  await assert.rejects(verifyMediaIntegrity(media, dir), /changed after review/);
});

test('a failed final caption preflight never records submission or clicks Publish', async () => {
  let checks = 0, submitted = false, clicked = false;
  await assert.rejects(finishPost({ mode: 'LIVE', confirmedLive: true, preflight: async () => { if (++checks === 2) throw new Error('Caption changed'); }, snapshot: async () => {}, step: async () => {}, markSubmitting: async () => { submitted = true; }, publish: async () => { clicked = true; }, verify: async () => {} }), /Caption changed/);
  assert.equal(submitted, false); assert.equal(clicked, false);
});
