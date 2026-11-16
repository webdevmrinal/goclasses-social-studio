// System interruptions are handled by the operator, never by answering calls,
// entering unlock credentials or navigating unrelated apps automatically.
export function androidInterruption(nodes,{expectedInstagram=false}={}){
 const visible=nodes.filter(n=>n.displayed==='true');
 if(visible.some(n=>/^(com\.samsung\.android\.incallui|com\.android\.incallui|com\.google\.android\.dialer)$/.test(n.package||'')))return {kind:'call',message:'A phone call interrupted Instagram. Finish the call on the phone, then return to the same Instagram screen. Studio will not answer or reject it.'};
 if(visible.some(n=>n.package==='com.android.systemui'&&/keyguard|bouncer|lockscreen|pinEntry|passwordEntry/i.test(n['resource-id']||'')))return {kind:'locked',message:'The phone is locked. Unlock it yourself, then return to the same Instagram screen. Studio will never enter your PIN or password.'};
 if(!expectedInstagram||visible.some(n=>n.package==='com.instagram.android'))return null;
 const foreign=visible.filter(n=>n.package&&!/^(android|com\.android\.systemui|io\.appium\.|com\.google\.android\.(permissioncontroller|providers\.media\.module)|com\.android\.permissioncontroller)/.test(n.package));
 return foreign.length?{kind:'app_switch',message:'Instagram is no longer in the foreground. Return to the same Instagram screen and continue here. No action in another app was attempted.'}:null;
}
