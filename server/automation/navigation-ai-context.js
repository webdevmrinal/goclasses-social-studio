// Copyright (c) 2026 Mrinal. Text-only advisory context; no device/model actions.
const INSTAGRAM='com.instagram.android',PREFIX=INSTAGRAM+':id/';
const stages=new Map([
  ['Open Instagram music','open_feed_music'],
  ['Open Story music','open_story_music'],
  ['Show the post\u2019s music row','find_post_music_row'],
  ["Show the post's music row",'find_post_music_row'],
  ['Open Edit info in Instagram','open_post_edit'],
  ['Open the post music library','open_post_music'],
  ['Wait for the audio clip','review_audio_clip'],
  ['Return to Edit info','return_to_post_edit'],
  ['Review Story sharing options','review_story_audience']
]);
const resources=new Set([
  'media_thumbnail_tray_button','new_post_title','action_sheet_container',
  'recycler_view','control_option_text','layout_edit_media_info_layout',
  'edit_media_scroll_view','action_bar_title','m2_audio_row',
  'music_browser_container','music_search_clips_landing_page_container',
  'row_search_edit_text','content_list','bottom_sheet_drag_handle_frame',
  'bottom_sheet_container','music_editor_controls_container','album_art_button',
  'music_button','story_share_controls_action_bar','next_button_textview'
]);
const labels=new Set(['Audio','Music','Add music','Edit','Edit info','Add audio','Add product details','Next','Return to music search','Search music','Browse','For you']);
const classes=new Set([
  'android.view.View','android.view.ViewGroup','android.widget.Button',
  'android.widget.ImageButton','android.widget.TextView','android.widget.EditText',
  'android.widget.ScrollView','android.widget.HorizontalScrollView',
  'android.widget.FrameLayout','android.widget.LinearLayout',
  'androidx.recyclerview.widget.RecyclerView'
]);
const interactiveClasses=new Set(['android.view.View','android.view.ViewGroup','android.widget.Button','android.widget.ImageButton','android.widget.TextView']);
const protectedId=/(?:^|[/:_])(?:login|log_in|sign_in|signup|sign_up|password|passwd|passcode|otp|verification|two_factor|twofactor|recovery|challenge|captcha|security|authentication|auth|recipient|direct|message|inbox|messenger|contact|phone_number|email_address|account_switcher)(?:[/:_]|$)/i;
const protectedLabel=/\b(?:log\s*in|sign\s*in|sign\s*up|create (?:a |new )?account|password|passcode|verification code|security code|two.factor authentication|confirm (?:it.s|your identity)|verify your identity|send (?:a )?message|send to|select recipients?|choose recipients?)\b/i;
const finalLabel=/^(?:save|share|post|publish|send|delete|remove|discard|archive|done|go\s*live|your stor(?:y|ies)|close friends)(?:\b|$)/i;
const finalId=/(?:^|[/:_])(?:save|share|publish|post|send|delete|remove|discard|archive)(?:[/:_]|$)/i;
const privateId=/(?:caption|username|user_name|profile_name|song_title|track_artist|artist_name|m2_audio_(?:primary|secondary)_text|audio_browser_track)/i;
const forbiddenIds=new Set(['action_bar_button_action','music_editor_done_button','bottom_sheet_done_button','music_duration_picker_done_button']);
const identityPrompt=/^(?:username|email(?: address)?|(?:phone|mobile) number)(?:$|[, /]| or )/i;
const safeInputs=new Set(['row_search_edit_text','edit_media_caption','caption_input_text_view']);
const flag=value=>value==='true'||value===true?true:value==='false'||value===false?false:undefined;

// This is an explicit projection, never a redacted copy of the accessibility
// tree. Arbitrary text, IDs, classes, bounds, reasons and user details cannot
// become cloud input, even on a new or renamed Instagram control.
export function navigationAIContext(nodes,details){
  const stage=details?.kind==='navigation'&&stages.get(details.title);
  if(!stage||!Array.isArray(nodes)||!nodes.length||nodes.length>5000)return null;
  const visible=nodes.filter(n=>n&&typeof n==='object'&&flag(n.displayed)===true);
  if(!visible.length||visible.some(n=>n.package!==INSTAGRAM))return null;
  // Inspect every visible node before applying output limits. A login or
  // recipient control after the first thirty nodes still closes the gate.
  if(visible.some(n=>{
    const id=typeof n['resource-id']==='string'&&n['resource-id'].startsWith(PREFIX)?n['resource-id'].slice(PREFIX.length):'';
    const editable=n.class==='android.widget.EditText'||n.tag==='android.widget.EditText';
    return flag(n.password)===true||flag(n.secure)===true||flag(n.sensitive)===true||flag(n['is-sensitive'])===true||editable&&!safeInputs.has(id)||protectedId.test(String(n['resource-id']||''))||[n.text,n['content-desc']].some(v=>typeof v==='string'&&(protectedLabel.test(v)||identityPrompt.test(v)));
  }))return null;
  const controls=[];
  for(const node of visible){
    const resource=typeof node['resource-id']==='string'&&node['resource-id'].startsWith(PREFIX)?node['resource-id'].slice(PREFIX.length):'';
    const known=resources.has(resource);
    if(privateId.test(String(node['resource-id']||''))||forbiddenIds.has(resource)||!known&&finalId.test(String(node['resource-id']||''))||[node.text,node['content-desc']].some(v=>typeof v==='string'&&finalLabel.test(v)))continue;
    const className=classes.has(node.class)?node.class:classes.has(node.tag)?node.tag:undefined;
    const input=className==='android.widget.EditText'||resource==='row_search_edit_text';
    const semantic=!input&&[node.text,node['content-desc']].find(value=>labels.has(value)&&(resource!=='m2_audio_row'||value==='Add music'));
    // Safe labels on renamed, clickable native controls remain useful without
    // transmitting their unknown resource ID or other accessibility strings.
    if(!known&&!(semantic&&flag(node.clickable)===true&&interactiveClasses.has(className)))continue;
    const control={};
    if(semantic)control.label=semantic;
    if(known)control.resourceId=PREFIX+resource;
    if(className)control.className=className;
    for(const key of ['clickable','enabled','scrollable']){const value=flag(node[key]);if(value!==undefined)control[key]=value;}
    if(!Object.keys(control).length)continue;
    if(controls.length===30)break;
    if(JSON.stringify({stage,controls:[...controls,control]}).length>4000)break;
    controls.push(control);
  }
  return controls.length?{stage,controls}:null;
}
