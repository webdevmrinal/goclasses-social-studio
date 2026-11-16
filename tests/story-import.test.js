import test from 'node:test';import assert from 'node:assert/strict';
import {parseCaptions} from '../shared/platforms.js';import {importStory,storyLinks} from '../shared/instagram.js';import {exportStoryImport} from '../shared/story-import.js';
const block=body=>'[INSTAGRAM_STORY]\n'+body+'\n[/INSTAGRAM_STORY]',input=body=>'=====INSTAGRAM=====\nHello \u{1f393} & welcome!\n\n=====TELEGRAM=====\nPublic channel text\n\n'+block(body);
test('ranked metadata never leaks into public captions and selects the first valid URL',()=>{
 const p=parseCaptions(input('enabled: true\nlinks:\n  3 | Website | https://example.org/\n  1 | Apply Now | https://example.org/apply?id=4&stream=CS#form\n  2 | Read Notice | https://example.org/notice.pdf'));
 assert.deepEqual(p.errors,[]);assert.equal(p.captions.instagram,'Hello \u{1f393} & welcome!');assert.equal(p.captions.telegram,'Public channel text');assert(!Object.values(p.captions).some(s=>s.includes('INSTAGRAM_STORY')));
 const story=importStory(p.captions,p.storyImport);assert(story.enabled&&story.enabledByUser&&story.linkEnabled);assert.equal(story.label,'Apply Now');assert.equal(story.url,'https://example.org/apply?id=4&stream=CS#form');assert.deepEqual(story.importedLinks.map(l=>l.priority),[1,2,3]);
});
test('Unicode, code fences, CRLF and HTML ampersands do not corrupt captions or URLs',()=>{
 const p=parseCaptions('```text\r\n'+input('enabled: true\nlinks:\n1 | \u092b\u0949\u0930\u094d\u092e \u092d\u0930\u0947\u0902 \u2705 | https://example.org/apply?a=1&amp;b=(CS)').replaceAll('\n','\r\n')+'\r\n```');assert.deepEqual(p.errors,[]);assert.equal(p.storyImport.links[0].url,'https://example.org/apply?a=1&b=(CS)');assert.match(p.storyImport.links[0].label,/\u092b/);
});
test('no-link metadata explicitly enables a normal Story; disabled and legacy imports stay off',()=>{
 for(const body of ['enabled: true\nlinks: []','enabled: true\nlinks:']){const p=parseCaptions(input(body)),story=importStory(p.captions,p.storyImport);assert(story.enabled);assert(!story.linkEnabled);assert.equal(story.url,'');}
 const off=parseCaptions(input('enabled: false\nlinks: []'));assert(!importStory(off.captions,off.storyImport).enabled);const old=parseCaptions('=====INSTAGRAM=====\nHello\n=====INSTAGRAM_STORY=====\nApplication Form\nhttps://example.org/');assert(!importStory(old.captions,old.storyImport).enabled);
});
test('invalid links are skipped safely, duplicates are stable and long labels fit the native limit',()=>{
 const p=parseCaptions(input('links:\n1 | Unsafe | javascript:alert(1)\n2 | An exceptionally long label with emoji \u{1f393} | https://example.org/apply\n2 | Same URL | https://example.org/apply\n3 | Private | https://user:password@example.org/'));
 assert.deepEqual(p.errors,[]);assert.equal(p.storyImport.links.length,1);assert([...p.storyImport.links[0].label].length<=20);assert(p.warnings.length>=3);
});
test('malformed and repeated blocks fail import instead of entering public captions',()=>{
 for(const text of [input('enabled: true').replace('[/INSTAGRAM_STORY]',''),input('enabled: true')+'\n'+block('links: []'),input('enabled: true\nenabled: false'),input('enabled: maybe')])assert(parseCaptions(text).errors.length);
});
test('ranked labels retain priority and wording over heuristic caption URL suggestions',()=>{
 const links=storyLinks({linkedin:'Application: https://example.org/apply'},[{priority:2,label:'Read Terms',url:'https://example.org/terms'},{priority:1,label:'Join This Program',url:'https://example.org/apply'}]);assert.equal(links[0].label,'Join This Program');assert.equal(links[1].label,'Read Terms');assert.equal(links.length,2);
});
test('manual label and URL edits round-trip through caption export and fresh import',()=>{
 const text=exportStoryImport({enabled:true,linkEnabled:true,label:'Check Eligibility',url:'https://example.org/new?x=1&y=2',importedLinks:[{priority:1,label:'Apply',url:'https://example.org/old'}]});const parsed=parseCaptions('=====INSTAGRAM=====\nPublic\n'+text),story=importStory(parsed.captions,parsed.storyImport);assert.equal(story.label,'Check Eligibility');assert.equal(story.url,'https://example.org/new?x=1&y=2');
});
