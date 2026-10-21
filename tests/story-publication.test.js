// Copyright (c) 2026 Mrinal. Captured Story completion controls; all sessions/actions are simulated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeId } from '../server/automation/android-native.js';
import { nativeStoryPublicationEvidence, confirmNativeStoryPublication } from '../server/automation/native-story.js';
import { InterventionError } from '../server/automation/utils.js';

const node = (id, attrs = {}) => {
  const type = attrs.class || attrs.tag || 'android.widget.TextView';
  return { ...(id ? { 'resource-id': nativeId(id) } : {}), tag: type, class: type, package: 'com.instagram.android', displayed: 'true', enabled: 'true', clickable: 'false', text: '', 'content-desc': '', ...attrs };
};
// Sanitized from actual-story-after-share-nodes.json: no recipients, account names or images.
const completionSheet = () => [
  node('camera_photo_texture_view', { tag: 'android.view.View', bounds: '[162,37][378,421]' }),
  node('title_text_view', { text: 'Also share to', bounds: '[24,468][516,535]' }),
  node('title', { text: 'Also share to', 'content-desc': 'Also share to', bounds: '[6,623][195,695]' }),
  node('direct_recipient_add_to_highlights_row', { tag: 'android.widget.LinearLayout', clickable: 'true', bounds: '[0,695][540,785]' }),
  node('add_to_highlights_label', { text: 'Add to highlights', bounds: '[96,726][480,753]' }),
  node('one_tap_send_button_container', { tag: 'android.widget.Button', clickable: 'true', bounds: '[385,871][516,932]' }),
  node('selectable_user_row_send_button_text_view', { text: 'Send', bounds: '[414,888][487,915]' }),
  node('send_button_container', { tag: 'android.widget.FrameLayout', bounds: '[0,1038][540,1134]' }),
  node('send_button', { tag: 'android.widget.Button', clickable: 'true', 'content-desc': 'Done', bounds: '[24,1038][516,1122]' }),
  node(null, { text: 'Done', bounds: '[244,1066][295,1093]' })
];
const without = (nodes, id) => nodes.filter(n => n['resource-id'] !== nativeId(id));
const change = (nodes, id, attrs) => nodes.map(n => n['resource-id'] === nativeId(id) ? { ...n, ...attrs } : n);
const sheetProof = { verifiedBy: 'native_story_completion_sheet', instagramAccepted: true, acknowledgement: 'also_share_to_done' };
const toastProof = { verifiedBy: 'native_story_toast', instagramAccepted: true, acknowledgement: 'story_shared_toast' };
const home = () => [node('profile_tab'), node('profile_header_create_button')];

function session(frames, { afterDone = home(), clickError } = {}) {
  let index = 0, attempted = false;
  const calls = [], deadlines = [];
  const s = {
    calls, deadlines,
    screen: async () => structuredClone(attempted ? afterDone : frames[Math.min(index++, frames.length - 1)]),
    until: async (predicate, message, timeout) => {
      deadlines.push(timeout);
      for (let i = 0; i < Math.max(8, frames.length + 3); i++) { const result = await predicate(await s.screen()); if (result) return result; }
      throw new InterventionError(message);
    },
    click: async (using, selector) => {
      calls.push({ using, selector });
      assert.equal(using, 'xpath');
      assert(selector.includes('@package="com.instagram.android"'));
      assert(selector.includes('android.widget.Button'));
      assert(selector.includes('@content-desc="Done"'));
      assert(selector.includes('@bounds="[24,1038][516,1122]"'));
      assert(!selector.includes(nativeId('send_button')), 'A Send resource ID must never be used as an unrestricted click selector');
      assert(!selector.includes('one_tap_send_button_container')); assert(!selector.includes('share_story_button'));
      assert.equal(attempted, false, 'Done is attempted at most once per session'); attempted = true;
      if (clickError) throw clickError;
    },
    clickId: async () => assert.fail('Confirmation never clicks another Share, recipient Send, or unscoped Done ID'),
    find: async () => assert.fail('Confirmation must use the scoped semantic Done control'),
    request: async () => assert.fail('Confirmation never sends native publication requests'),
    screenshot: async () => assert.fail('Confirmation reads accessibility proof only')
  };
  return s;
}
function assertInstagramOnly(receipt) {
  assert.equal(receipt.instagramAccepted, true);
  assert.equal(receipt.facebookAccepted, undefined); assert.equal(receipt.requestedDestinations, undefined);
  assert.equal(receipt.destinations, undefined); assert.equal(receipt.audience, undefined);
  assert(!JSON.stringify(receipt).includes('facebook'), 'Requested Facebook sharing is not a confirmed Facebook publication');
  assert(Number.isFinite(Date.parse(receipt.verifiedAt)));
}

test('visible native legacy Story success toasts remain valid without any dismissal action', async t => {
  for (const text of ['Your story has been shared', 'Added to your story', 'Story shared']) await t.test(text, async () => {
    const nodes = [node(null, { text })], original = structuredClone(nodes);
    assert.deepEqual(nativeStoryPublicationEvidence(nodes), toastProof); assert.deepEqual(nodes, original);
    const s = session([nodes]), receipt = await confirmNativeStoryPublication(s, { timeout: 1234 });
    assert.equal(receipt.verifiedBy, toastProof.verifiedBy); assert.equal(receipt.completionDismissed, false);
    assertInstagramOnly(receipt); assert.deepEqual(s.calls, []);
  });
  for (const nodes of [[node(null, { text: 'Story shared', displayed: 'false' })], [node(null, { text: 'Story shared', package: 'another.app' })], [node(null, { text: 'Story shared elsewhere' })]]) assert.equal(nativeStoryPublicationEvidence(nodes), null);
});

test('the captured Also share to sheet proves Instagram acceptance while leaving Facebook as requested metadata only', () => {
  const nodes = completionSheet(), original = structuredClone(nodes);
  assert.deepEqual(nativeStoryPublicationEvidence(nodes), sheetProof); assert.deepEqual(nodes, original);
  assert.equal(sheetProof.instagramAccepted, true); assert.equal(sheetProof.facebookAccepted, undefined);
  // The captured background camera preview and recipient Send buttons cannot become confirmation actions.
  assert(nodes.some(n => n['resource-id'] === nativeId('camera_photo_texture_view')));
  assert(nodes.some(n => n['resource-id'] === nativeId('one_tap_send_button_container')));
});

test('missing, duplicate, hidden, disabled or changed completion controls cannot prove Story publication', async t => {
  const valid = completionSheet(), done = valid.find(n => n['resource-id'] === nativeId('send_button'));
  const cases = [
    ['missing main title', without(valid, 'title_text_view')],
    ['duplicate main title', [...valid, node('title_text_view', { text: 'Also share to' })]],
    ['changed main title', change(valid, 'title_text_view', { text: 'Share to' })],
    ['hidden main title', change(valid, 'title_text_view', { displayed: 'false' })],
    ['missing second title', without(valid, 'title')],
    ['changed second title', change(valid, 'title', { text: 'Share to', 'content-desc': 'Share to' })],
    ['missing highlights row', without(valid, 'direct_recipient_add_to_highlights_row')],
    ['changed highlights label', change(valid, 'add_to_highlights_label', { text: 'Highlights' })],
    ['missing Done', without(valid, 'send_button')],
    ['duplicate Done', [...valid, { ...done }]],
    ['hidden Done', change(valid, 'send_button', { displayed: 'false' })],
    ['disabled Done', change(valid, 'send_button', { enabled: 'false' })],
    ['nonclickable Done', change(valid, 'send_button', { clickable: 'false' })],
    ['wrong Done class', change(valid, 'send_button', { tag: 'android.widget.TextView', class: 'android.widget.TextView' })],
    ['changed Done label', change(valid, 'send_button', { 'content-desc': 'Send' })],
    ['foreign Done', change(valid, 'send_button', { package: 'another.app' })],
    ['missing Done bounds', change(valid, 'send_button', { bounds: '' })],
    ['zero-size Done bounds', change(valid, 'send_button', { bounds: '[24,1038][24,1038]' })],
    ['foreign sheet package', valid.map(n => ({ ...n, package: 'another.app' }))],
    ['generic Done text only', [node(null, { text: 'Done' })]],
    ['visible password prompt', [...valid, node(null, { password: 'true' })]]
  ];
  for (const [name, nodes] of cases) await t.test(name, () => assert.equal(nativeStoryPublicationEvidence(nodes), null));
});

test('an unfinished Story, music, link or feed editor overrides a misleading completion-looking sheet', async t => {
  for (const id of ['share_story_button', 'story_share_controls_action_bar', 'music_editor_done_button', 'music_editor_controls_container', 'link_sticker_list_web_url_edit_text', 'caption_input_text_view', 'new_post_title']) await t.test(id, () => {
    assert.equal(nativeStoryPublicationEvidence([...completionSheet(), node(id)]), null);
    assert.deepEqual(nativeStoryPublicationEvidence([...completionSheet(), node(id, { displayed: 'false' })]), sheetProof);
  });
});

test('completion waits through transitions and dismisses only the captured Done once', async () => {
  const s = session([[], [node('music_editor_done_button')], completionSheet(), completionSheet()]);
  const receipt = await confirmNativeStoryPublication(s, { timeout: 1234 });
  assert.equal(receipt.verifiedBy, sheetProof.verifiedBy); assert.equal(receipt.acknowledgement, sheetProof.acknowledgement);
  assert.equal(receipt.completionDismissed, true); assertInstagramOnly(receipt); assert.equal(s.calls.length, 1);
  assert(s.deadlines.includes(1234));
});

test('changed completion evidence is revalidated before attempting Done', async () => {
  const changed = change(completionSheet(), 'send_button', { 'content-desc': 'Send' });
  const s = session([completionSheet(), changed]);
  const receipt = await confirmNativeStoryPublication(s);
  assert.equal(receipt.completionDismissed, false); assertInstagramOnly(receipt); assert.deepEqual(s.calls, []);
});

test('a lost Done response preserves accepted Story proof and never replays the click', async () => {
  const diagnostics = [], s = session([completionSheet()], { afterDone: completionSheet(), clickError: Error('Lost Done response') });
  const receipt = await confirmNativeStoryPublication(s, { onDiagnostic: (...args) => diagnostics.push(args) });
  assert.equal(receipt.completionDismissed, false); assertInstagramOnly(receipt); assert.equal(s.calls.length, 1);
  assert(JSON.stringify(diagnostics).includes('completion_pending'));
  const repeated = await confirmNativeStoryPublication(s);
  assert.equal(repeated.completionDismissed, false); assertInstagramOnly(repeated); assert.equal(s.calls.length, 1);
});

test('an unchanged sheet after Done preserves its receipt without another Done or Share', async () => {
  const s = session([completionSheet()], { afterDone: completionSheet() });
  const receipt = await confirmNativeStoryPublication(s);
  assert.equal(receipt.completionDismissed, false); assertInstagramOnly(receipt); assert.equal(s.calls.length, 1);
  const repeated = await confirmNativeStoryPublication(s);
  assert.equal(repeated.completionDismissed, false); assert.equal(s.calls.length, 1);
});

test('a missing completion receipt remains uncertain and performs no mutation', async () => {
  const s = session([[node('music_editor_done_button')]]);
  await assert.rejects(confirmNativeStoryPublication(s, { timeout: 1 }), /Story|story|confirm|completion/);
  assert.deepEqual(s.calls, []);
});

test('external cancellation propagates without attempting Done or any publication action', async () => {
  const s = session([completionSheet()]), controller = new AbortController();
  controller.abort(Error('Operator stopped the run')); s.signal = controller.signal;
  await assert.rejects(confirmNativeStoryPublication(s), /Operator stopped the run/); assert.deepEqual(s.calls, []);
});

test('cancellation during an ambiguous Done response still propagates and never retries cleanup', async () => {
  const s = session([completionSheet()]), controller = new AbortController(), scopedClick = s.click;
  s.signal = controller.signal;
  s.click = async (...args) => { await scopedClick(...args); controller.abort(Error('Operator stopped during Done')); throw Error('Done response interrupted'); };
  await assert.rejects(confirmNativeStoryPublication(s), /Operator stopped during Done/);
  assert.equal(s.calls.length, 1);
});