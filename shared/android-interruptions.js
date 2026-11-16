// System interruptions are handled by the operator, never by answering calls,
// entering unlock credentials or navigating unrelated apps automatically.
export function androidInterruption(nodes,{expectedInstagram=false}={}){
 const visible=nodes.filter(n=>n.displayed==='true');
 if(visible.some(n=>/^(com\.samsung\.android\.incallui|com\.android\.incallui|com\.google\.android\.dialer)$/.test(n.package||'')))return {kind:'call',message:'A phone call interrupted Instagram. Finish the call on the phone, then return to the same Instagram screen. Studio will not answer or reject it.'};
 if(visible.some(n=>n.package==='com.android.systemui'&&/keyguard|bouncer|lockscreen|pinEntry|passwordEntry/i.test(n['resource-id']||'')))return {kind:'locked',message:'The phone is locked. Unlock it yourself, then return to the same Instagram screen. Studio will never enter your PIN or password.'};
 const system=visible.filter(n=>n.package==='com.android.systemui');
 const panel={kind:'system_panel',message:'The phone notification panel is open. Close it yourself and return to the same Instagram screen. Studio will not change phone settings or notifications.'};
 if(system.some(n=>/:id\/(?:notification_shade|quick_settings_panel|qs_panel|qs_frame)$/.test(n['resource-id']||'')))return panel;
 if((expectedInstagram||visible.some(n=>n.package==='com.instagram.android'))&&system.some(n=>/heads_up|notification_(?:content|main_column|header|template|material)|status_bar_latest_event_content|expandableNotificationRow/i.test((n['resource-id']||'')+' '+(n.class||''))))return {kind:'notification',message:'A phone notification is covering Instagram. Let the banner disappear, or close it yourself, then continue on the same screen. Nothing in the notification was opened or dismissed.'};
 if(system.some(n=>n['resource-id']==='com.android.systemui:id/notification_panel'))return panel;
 if(!expectedInstagram||visible.some(n=>n.package==='com.instagram.android'))return null;
 const foreign=visible.filter(n=>n.package&&!/^(android|com\.android\.systemui|io\.appium\.|com\.google\.android\.(permissioncontroller|providers\.media\.module)|com\.android\.permissioncontroller)/.test(n.package));
 return foreign.length?{kind:'app_switch',message:'Instagram is no longer in the foreground. Return to the same Instagram screen and continue here. No action in another app was attempted.'}:null;
}
