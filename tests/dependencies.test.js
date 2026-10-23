// Copyright (c) 2026 Mrinal. Offline dependency review; no publication requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDraft } from '../shared/draft.js';
import { dependencyRequirements, resolveDependencyLinks, setDestinationSelected, skipDestination, syncStorySelection } from '../shared/dependencies.js';
import { destinationReadiness } from '../shared/readiness.js';

const url = 'https://www.instagram.com/p/EXISTING_POST/';
const otherUrl = 'https://www.instagram.com/reel/ANOTHER_POST/';
const config = { platforms: { instagram: { handle: 'ours' }, manychat: { flowUrl: 'https://app.manychat.com/fb123/cms/easy-builder' } } };
const draft = (selected = ['manychat']) => {
  const value = freshDraft(); value.selected = selected; value.captions.manychat = 'Reviewed DM'; value.captions.instagram = 'Reviewed feed';
  return value;
};
const historical = (postUrl, status = 'failed') => ({ id: 'old-run', captions: { manychat: 'Reviewed DM', instagram: 'Reviewed feed' }, media: [], mediaByPlatform: { manychat: [] }, manychat: { postUrl }, items: [{ id: 'manychat', status, message: 'Review previous activation' }] });
const ready = (value, runs = []) => destinationReadiness(value, [], config, {}, undefined, runs).manychat;

test('selected destinations override stale Story flags without silently adding a Story', () => {
  const value = draft(); value.instagram.story.enabled = true;
  assert.equal(syncStorySelection(value), value); assert.deepEqual(value.selected, ['manychat']); assert.equal(value.instagram.story.enabled, false);
  const standalone = { selected: ['instagramStory'] }; syncStorySelection(standalone);
  assert.equal(standalone.instagram.story.enabled, true); assert.deepEqual(standalone.selected, ['instagramStory']);
});

test('destination toggles use canonical unique order and feed deselection clears its attached Story', () => {
  const value = draft(['instagramStory', 'manychat', 'instagram', 'manychat']);
  assert.equal(setDestinationSelected(value, 'x', true), value);
  assert.deepEqual(value.selected, ['instagram', 'x', 'manychat', 'instagramStory']); assert.equal(value.instagram.story.enabled, true);
  setDestinationSelected(value, 'instagram', false);
  assert.deepEqual(value.selected, ['x', 'manychat']); assert.equal(value.instagram.story.enabled, false);
  setDestinationSelected(value, 'instagram', true);
  assert.deepEqual(value.selected, ['instagram', 'x', 'manychat']); assert.equal(value.instagram.story.enabled, false);
  setDestinationSelected(value, 'instagramStory', true);
  assert.equal(value.instagram.story.enabled, true); setDestinationSelected(value, 'instagramStory', false); assert.equal(value.instagram.story.enabled, false);
});

test('a selection mutation rejects unknown destinations before changing the draft', () => {
  const value = draft(), original = structuredClone(value);
  assert.throws(() => setDestinationSelected(value, 'unknown', true), /Unknown destination/); assert.deepEqual(value, original);
});

test('requirements identify only selected dependencies without a feed or a valid existing URL', () => {
  const value = draft(['manychat', 'instagramStory']);
  assert.deepEqual(dependencyRequirements(value), [
    { id: 'manychat', parentId: 'instagram', field: 'manychat.postUrl' },
    { id: 'instagramStory', parentId: 'instagram', field: 'instagram.story.sourcePostUrl' }
  ]);
  value.manychat.postUrl = url;
  assert.deepEqual(dependencyRequirements(value).map(row => row.id), ['instagramStory']);
  value.instagram.story.sourcePostUrl = otherUrl;
  assert.deepEqual(dependencyRequirements(value), []);
  value.manychat.postUrl = ''; value.instagram.story.sourcePostUrl = '';
  assert.deepEqual(dependencyRequirements({ ...value, selected: ['instagram', 'manychat', 'instagramStory'] }), []);
  assert.deepEqual(dependencyRequirements({ ...value, selected: ['x'] }), []);
  const row = dependencyRequirements(value)[0]; row.field = 'changed';
  assert.equal(dependencyRequirements(value)[0].field, 'manychat.postUrl');
});

test('dependency links normalize exact URLs on a detached draft without adding destinations', () => {
  const value = draft(['manychat', 'instagramStory']), original = structuredClone(value);
  const resolved = resolveDependencyLinks(value, { manychat: 'https://instagram.com/p/EXISTING_POST/?igsh=receipt#proof', instagramStory: 'https://www.instagram.com/ours/reel/ANOTHER_POST/' });
  assert.deepEqual(value, original); assert.deepEqual(resolved.selected, value.selected); assert.equal(resolved.manychat.postUrl, url);
  assert.equal(resolved.instagram.story.sourcePostUrl, otherUrl); assert.equal(resolved.instagram.story.enabled, true);
  assert.deepEqual(dependencyRequirements(resolved), []);
  resolved.instagram.story.layout.card.x = .4; resolved.manychat.links.push({ label: 'Apply', url: 'https://example.com/' });
  assert.deepEqual(value, original);
});

test('invalid and incomplete dependency resolutions never change the caller draft', () => {
  const value = draft(['manychat', 'instagramStory']), original = structuredClone(value);
  for (const invalid of ['', '/p/EXISTING_POST/', '//instagram.com/p/EXISTING_POST/', 'http://instagram.com/p/EXISTING_POST/', 'https://user@instagram.com/p/EXISTING_POST/', 'https://instagram.com:444/p/EXISTING_POST/', 'https://instagram.com.evil.test/p/EXISTING_POST/', 'https://instagram.com/p/WRONG/../EXISTING_POST/', 'https://instagram.com/../p/EXISTING_POST/', 'https://instagram.com/p/EXISTING_POST/extra', 'https://instagram.com/p/EXISTING_POST/\n', 'https:\\instagram.com\\p\\EXISTING_POST\\', 'https://instagram.com/ours/', null, 42]) {
    assert.throws(() => resolveDependencyLinks(value, { manychat: url, instagramStory: invalid }), /exact HTTPS Instagram/);
    assert.deepEqual(value, original);
  }
  assert.throws(() => resolveDependencyLinks(value, { manychat: url }), /Instagram Story/); assert.deepEqual(value, original);
});

test('resolving missing links preserves already reviewed sources and ignores unselected links', () => {
  const value = draft(); value.manychat.postUrl = url;
  const resolved = resolveDependencyLinks(value, { manychat: otherUrl, instagramStory: otherUrl });
  assert.equal(resolved.manychat.postUrl, url); assert.equal(resolved.instagram.story.sourcePostUrl, ''); assert.deepEqual(resolved.selected, ['manychat']);
});

test('skip review retains dependents for their existing-post prompt and leaves cancellation reversible', () => {
  const value = draft(['instagram', 'manychat', 'instagramStory']); syncStorySelection(value);
  const original = structuredClone(value), skipped = skipDestination(value, 'instagram');
  assert.deepEqual(value, original); assert.deepEqual(skipped.selected, ['manychat', 'instagramStory']); assert.equal(skipped.instagram.story.enabled, true);
  assert.deepEqual(dependencyRequirements(skipped).map(row => row.id), ['manychat', 'instagramStory']);
  const storySkipped = skipDestination(skipped, 'instagramStory');
  assert.deepEqual(storySkipped.selected, ['manychat']); assert.equal(storySkipped.instagram.story.enabled, false);
  assert.deepEqual(skipped.selected, ['manychat', 'instagramStory']);
  const none = skipDestination(storySkipped, 'manychat'); assert.deepEqual(none.selected, []); assert.deepEqual(dependencyRequirements(none), []);
  assert.deepEqual(value, original, 'Discarding the candidate leaves the original review unchanged');
});

test('ManyChat readiness requires the feed or its exact existing source in either run mode', () => {
  const value = draft(); assert.equal(ready(value).ready, false); assert(ready(value).errors.some(error => /exact published post/.test(error)));
  value.manychat.postUrl = url; assert.equal(ready(value).ready, true);
  value.manychat.postUrl = ''; value.selected.push('instagram'); assert.equal(ready(value).ready, true);
  value.selected = ['manychat']; value.manychat.postUrl = '/p/EXISTING_POST/'; assert.equal(ready(value).ready, false);
});

test('a failed ManyChat target does not block a different post, while equivalent URLs remain the same attempt', () => {
  const value = draft(), previous = historical(url); value.manychat.postUrl = otherUrl;
  assert.equal(ready(value, [previous]).ready, true);
  value.manychat.postUrl = 'https://instagram.com/p/EXISTING_POST/?igsh=shared';
  assert.equal(ready(value, [previous]).ready, false); assert(ready(value, [previous]).errors.some(error => /Last attempt/.test(error)));
});

test('same-post uncertainty cannot be bypassed by editing the DM, media or the latest run', () => {
  const value = draft(), uncertain = historical(url, 'uncertain'); value.manychat.postUrl = url; value.captions.manychat = 'A different DM';
  value.mediaIds = ['new-image'];
  const recent = historical(otherUrl, 'dry_run');
  const result = ready(value, [recent, uncertain]); assert.equal(result.ready, false); assert(result.errors.some(error => /activation for this exact/.test(error)));
  value.manychat.postUrl = otherUrl; assert.equal(ready(value, [recent, uncertain]).ready, true);
});

test('automatic ManyChat outcomes remain bound to the confirmed feed when its URL is supplied later', () => {
  const value = draft(); value.manychat.postUrl = url;
  const previous = historical('', 'uncertain'); previous.items.unshift({ id: 'instagram', status: 'posted', publication: { postUrl: url } });
  assert.equal(ready(value, [previous]).ready, false);
  previous.items.shift(); previous.sourceInstagramPublication = { postUrl: url };
  assert.equal(ready(value, [previous]).ready, false);
  previous.items[0].status = 'failed'; assert(ready(value, [previous]).errors.some(error => /Last attempt/.test(error)));
  value.manychat.postUrl = otherUrl; assert.equal(ready(value, [previous]).ready, true);
});
