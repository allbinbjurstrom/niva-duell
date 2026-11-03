import {RULES,moveBody} from './rules.mjs';

export const SETTINGS_KEY='niva-duell-controls-v1';
/** @typedef {{dpi:number,sensitivity:number,adsSensitivity:number,scopeSensitivity:number,aimMode:string,scopeMode:string,sound:boolean,dynamicCrosshair:boolean,crosshairColor:string,crosshairDot:boolean,crosshairLength:number,crosshairGap:number,crosshairThickness:number}} Controls */
/** @type {Readonly<Controls>} */
export const DEFAULT_CONTROLS=Object.freeze({dpi:800,sensitivity:.35,adsSensitivity:1,scopeSensitivity:1,aimMode:'hold',scopeMode:'toggle',sound:true,dynamicCrosshair:false,crosshairColor:'#a5ffe0',crosshairDot:false,crosshairLength:4,crosshairGap:4,crosshairThickness:2});
export const CONTROL_RANGES=Object.freeze({dpi:[50,32000],sensitivity:[.001,10],adsSensitivity:[.1,10],scopeSensitivity:[.1,10],crosshairLength:[1,12],crosshairGap:[0,12],crosshairThickness:[1,4]});
/** @returns {Controls} */
export function normalizeControls(value={}){
  const result={...DEFAULT_CONTROLS};
  for(const [key,[min,max]] of Object.entries(CONTROL_RANGES)){
    const n=value?.[key];if(typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max)result[key]=n;
  }
  for(const key of ['aimMode','scopeMode'])if(['hold','toggle'].includes(value?.[key]))result[key]=value[key];
  for(const key of ['sound','dynamicCrosshair','crosshairDot'])if(typeof value?.[key]==='boolean')result[key]=value[key];
  if(typeof value?.crosshairColor==='string'&&/^#[0-9a-f]{6}$/i.test(value.crosshairColor))result.crosshairColor=value.crosshairColor;
  return result;
}
// Calibration target: .07 degrees per mouse count at sensitivity 1. Hardware DPI is informational.
export const radiansPerCount=sensitivity=>sensitivity*.07*Math.PI/180;
export const cmPerTurn=(dpi,sensitivity)=>360/(dpi*sensitivity*.07)*2.54;
export const verticalFov=(aspect,zoom=1)=>2*Math.atan(Math.tan(103*Math.PI/360)/zoom/aspect)*180/Math.PI;
export const effectiveZoom=(weapon,input)=>weapon.id==='operator'&&input.zoomLevel===2?5:weapon.zoom;
export function lookScale(settings,weapon,input){
  const zoom=input.aim&&weapon.zoom>1?effectiveZoom(weapon,input):1;
  return radiansPerCount(settings.sensitivity)*(zoom>1?(weapon.id==='operator'?settings.scopeSensitivity:settings.adsSensitivity)/zoom:1);
}
export function pressMouse(input,weapon,button,settings,viewTime){
  const firing=button===0||button===2&&(weapon.burst>0||weapon.melee);
  if(firing)Object.assign(input,{triggerViewTime:viewTime,triggerYaw:input.yaw,triggerPitch:input.pitch,triggerFromId:input.viewFromId,triggerToId:input.viewToId,triggerOwnSeq:input.ownSeq,triggerOwnAlpha:input.ownAlpha,triggerAim:input.aim,triggerZoomLevel:input.zoomLevel});
  if(button===0){input.fire=true;input.firePress++;return 'primary';}
  if(button!==2)return null;
  if(weapon.burst||weapon.melee){input.altFire=true;input.altPress++;return 'alternate';}
  if(weapon.zoom>1){
    const mode=weapon.id==='operator'?settings.scopeMode:settings.aimMode;
    if(mode==='hold'){input.aim=true;input.zoomLevel=1;}
    else if(weapon.id==='operator'&&input.aim&&input.zoomLevel===1)input.zoomLevel=2;
    else{input.aim=!input.aim;input.zoomLevel=1;}
  }
  return null;
}
// Rebase on an acknowledged simulation frame, then replay only frames the server has not applied.
// No interpolation or velocity extrapolation is applied to the local player.
export function reconcileBody(authoritative,pending,weapon,previous=authoritative){
  const remaining=pending.filter(frame=>frame.input.seq>authoritative.seq);
  const body={...authoritative};let previousBody={...previous};
  for(const frame of remaining){previousBody={...body};moveBody(body,frame.input,1/RULES.tickRate,weapon);}
  return {body,previousBody,pending:remaining};
}
