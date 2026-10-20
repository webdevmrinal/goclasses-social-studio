// Copyright (c) 2026 Mrinal. Conservative performance settings for our dedicated AVD.
export const ANDROID_DISPLAY={width:540,height:1170,density:240};
export const ANDROID_ANIMATIONS=['window_animation_scale','transition_animation_scale','animator_duration_scale'];
export const ANDROID_DRIVER_SETTINGS={waitForIdleTimeout:100,waitForSelectorTimeout:100,enableMultiWindows:false,enableTopmostWindowFromActivePackage:false};
export function displaySettings(display=ANDROID_DISPLAY){
  return {'hw.lcd.width':String(display.width),'hw.lcd.height':String(display.height),'hw.lcd.density':String(display.density),'skin.name':display.width+'x'+display.height};
}
export function fitScrollArea({width,height}){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<300||height<600)throw new Error('Android picker dimensions could not be verified.');
  // The original safe picker region was measured on 720 x 1560. Scale
  // proportionally, so it stays away from Allow/Cancel on lighter displays.
  return {left:Math.round(width*4/720),top:Math.round(height*500/1560),width:Math.floor(width*712/720),height:Math.floor(height*750/1560),direction:'down',percent:.65};
}

export function galleryScrollArea(bounds,{width,height}){
 if(!Number.isFinite(width)||!Number.isFinite(height))throw new Error('Android gallery dimensions could not be verified.');
 const left=Math.max(4,bounds.x+4),top=Math.max(Math.round(height*.25),bounds.y+4),right=Math.min(width-4,bounds.x+bounds.width-4),bottom=Math.min(Math.floor(height*.91),bounds.y+bounds.height-4);
 if(right-left<40||bottom-top<50)throw new Error('The Android gallery is too small to scroll safely.');
 return {left,top,width:right-left,height:bottom-top,direction:'down',percent:.65};
}
