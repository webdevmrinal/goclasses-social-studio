// Read-only identity for both legacy and current Instagram own-Story headers.
const prefix='com.instagram.android:id/';
const visible=nodes=>nodes.filter(n=>n.displayed==='true'&&n.package==='com.instagram.android');
const bounds=value=>{const m=String(value||'').match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);return m?m.slice(1).map(Number):null;};
const inside=(node,parent)=>{const b=bounds(node.bounds),p=bounds(parent.bounds);return b&&p&&b[0]>=p[0]&&b[1]>=p[1]&&b[2]<=p[2]&&b[3]<=p[3]&&b[2]>b[0]&&b[3]>b[1];};
export function instagramStoryAgeSeconds(value){
 const text=String(value||'').trim().toLowerCase();if(/^(now|just now)$/.test(text))return 0;
 const m=text.match(/^(\d+)\s*(s|sec(?:ond)?s?|m|min(?:ute)?s?|h|hours?|d|days?)(?:\s+ago)?$/);
 return m?Number(m[1])*({s:1,m:60,h:3600,d:86400}[m[2][0]]):null;
}
export function instagramOwnStoryIdentity(nodes,handle){
 if(!handle||nodes.some(n=>n.displayed==='true'&&n.password==='true'))return null;
 const current=visible(nodes),all=id=>current.filter(n=>n['resource-id']===prefix+id);
 if(current.some(n=>/\/(?:direct_external_share_container_view|direct_private_share_container_view|story_share_controls_action_bar|share_story_button|caption_input_text_view|music_editor_controls_container|link_sticker_list_web_url_edit_text|layout_edit_media_info_layout)$/.test(n['resource-id']||'')))return null;
 if(all('reel_viewer_root').length!==1||all('self_toolbar_menu_button').length!==1||!all('viewers_facepile_label').some(n=>n.text==='Activity'))return null;
 const legacy=all('reel_viewer_title');
 if(legacy.length){if(legacy.length!==1||legacy[0].text!==handle)return null;return {handle,ageSeconds:instagramStoryAgeSeconds(all('reel_viewer_timestamp')[0]?.text),header:'legacy'};}
 const headers=all('reel_viewer_text_container'),rows=all('reel_viewer_title_row_compose');
 if(headers.length!==1||rows.length!==1||!inside(rows[0],headers[0]))return null;
 const desc=headers[0]['content-desc']||'',start=handle+"'s story, ";
 if(!desc.startsWith(start)||!current.some(n=>n.text===handle&&inside(n,rows[0])))return null;
 const ageSeconds=instagramStoryAgeSeconds(desc.slice(start.length));
 if(ageSeconds===null)return null;
 return {handle,ageSeconds,header:'compose'};
}
