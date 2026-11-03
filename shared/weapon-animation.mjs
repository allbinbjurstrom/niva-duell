const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const ramp=(n,start,end)=>clamp((n-start)/(end-start),0,1);
const smooth=n=>n*n*(3-2*n);
const mix=(a,b,t)=>a+(b-a)*t;
const vec=(x=0,y=0,z=0)=>({x,y,z});
const blend=(a,b,t)=>vec(mix(a.x,b.x,t),mix(a.y,b.y,t),mix(a.z,b.z,t));
function rotate(v,r,order='XYZ'){
 const cx=Math.cos(r.x),sx=Math.sin(r.x),cy=Math.cos(r.y),sy=Math.sin(r.y),cz=Math.cos(r.z),sz=Math.sin(r.z);
 const x=v.x*cz-v.y*sz,y=v.x*sz+v.y*cz,z=v.z;
 if(order==='YXZ'){const yy=y*cx-z*sx,zz=y*sx+z*cx;return vec(x*cy+zz*sy,yy,-x*sy+zz*cy);}
 const xx=x*cy+z*sy,zz=-x*sy+z*cy;return vec(xx,y*cx-zz*sx,y*sx+zz*cx);
}

export const WEAPON_ANIMATION=Object.freeze({inspectSeconds:2.65,magOut:.24,magIn:.68,bolt:.83});
// First-person presentation only; world geometry keeps its physical scale.
export const WEAPON_VIEW_LAYOUT=Object.freeze({scale:.74,hipX:.27,hipY:-.255,hipZ:-.68,adsY:-.13616,adsZ:-.73,sightY:.184,sightZ:-.78});
const handMagazine=Object.freeze(vec(.026,0,0)),handBolt=Object.freeze(vec(0,-.035,0)),handSupport=Object.freeze(vec(.023,.03,0));
// Contact points are shared with the real meshes, so detached parts cannot drift
// away from their grip when either the hand or magazine rotates.
export const WEAPON_CONTACTS=Object.freeze({
 handMagazine,handBolt,handSupport,
 magazine:Object.freeze(vec(-.065+Math.cos(.1)*.026,-.17-Math.sin(.1)*.026,.03)),
 bolt:Object.freeze(vec(.015,0,0)),
 support:Object.freeze(vec(-.072+Math.cos(.1)*.023+Math.sin(.1)*.03,-.065-Math.sin(.1)*.023+Math.cos(.1)*.03,-.49))
});

/** Cosmetic pose only. Remaining times come from authoritative gameplay gates. */
export function sampleWeaponAnimation(input={}){
 const time=finite(input.time),motion=input.reducedMotion?.25:1;
 const reloadDuration=Math.max(.001,finite(input.reloadDuration,2.5));
 const equipDuration=Math.max(.001,finite(input.equipDuration,1));
 const reloadRemaining=Math.max(0,finite(input.reloadRemaining));
 const equipRemaining=Math.max(0,finite(input.equipRemaining));
 const reload=reloadRemaining>0?clamp(1-reloadRemaining/(reloadDuration*1000),0,1):-1;
 const equip=equipRemaining>0?clamp(1-equipRemaining/(equipDuration*1000),0,1):-1;
 const age=input.shotAt>0?Math.max(0,(time-finite(input.shotAt))/1000):100;
 const kick=age<.115?Math.exp(-age*33)*(1-Math.exp(-age*550)):0;
 const ads=!!input.ads;
 const position=vec(ads?0:WEAPON_VIEW_LAYOUT.hipX,ads?WEAPON_VIEW_LAYOUT.adsY:WEAPON_VIEW_LAYOUT.hipY,ads?WEAPON_VIEW_LAYOUT.adsZ:WEAPON_VIEW_LAYOUT.hipZ);
 const rotation=vec(0,ads?0:.075,ads?0:-.028);
 const support=vec(-.072,-.065,-.49),supportRotation=vec(0,0,-.1);
 const magazine=vec(),magazineRotation=vec();
 let magazineVisible=true,bolt=0,phase='idle',inspect=0;

 // One left-right sway over two running steps; this never changes the camera.
 const speed=Math.max(0,finite(input.speed)),stride=finite(input.stride);
 if(!input.reducedMotion&&input.grounded&&speed>.05){
  const amplitude=Math.min(speed/5.4,1)*(ads?.24:1);
  position.x+=Math.sin(stride)*.006*amplitude;
  position.y+=Math.cos(stride*2)*.003*amplitude;
  rotation.z+=Math.sin(stride)*.009*amplitude;
 }
 if(!input.reducedMotion){
  rotation.z+=clamp(finite(input.strafe),-1,1)*.012;
  rotation.y-=clamp(finite(input.lookYawDelta)*1.8,-.018,.018);
  rotation.x-=clamp(finite(input.lookPitchDelta)*1.8,-.014,.014);
 }
 position.z+=kick*.032*motion;
 rotation.x+=(kick*.060+clamp(finite(input.recoilPitch)*.32,0,.105))*motion;
 rotation.y+=clamp(finite(input.recoilYaw)*.32,-.06,.06)*motion;

 if(reload>=0){
  phase=reload<.20?'reload-reach':reload<.40?'reload-remove':reload<.57?'reload-fetch':reload<.73?'reload-seat':reload<.90?'reload-bolt':'reload-settle';
  const presentation=smooth(ramp(reload,0,.16))*(1-smooth(ramp(reload,.87,1)));
  position.x-=.035*presentation*motion;position.y+=.025*presentation;position.z+=.045*presentation;
  rotation.x-=.11*presentation*motion;rotation.y-=.14*presentation*motion;rotation.z+=.42*presentation*motion;
  const magGrip=vec(-.065,-.21,-.10),magLow=vec(-.14,-.48,-.025),magFetch=vec(-.23,-.43,.09),boltGrip=vec(.082,.137,-.09),boltReach=vec(.145,.015,-.07);
  let hand=support;
  if(reload<.21)hand=blend(support,magGrip,smooth(ramp(reload,.02,.21)));
  else if(reload<.40)hand=blend(magGrip,magLow,smooth(ramp(reload,.21,.40)));
  else if(reload<.56)hand=blend(magLow,magFetch,smooth(ramp(reload,.40,.56)));
  else if(reload<.70)hand=blend(magFetch,magGrip,smooth(ramp(reload,.56,.70)));
  else if(reload<.75)hand=blend(magGrip,boltReach,smooth(ramp(reload,.70,.75)));
  else if(reload<.80)hand=blend(boltReach,boltGrip,smooth(ramp(reload,.75,.80)));
  else if(reload<.90)hand=blend(boltGrip,vec(.082,.137,.005),Math.sin(ramp(reload,.80,.90)*Math.PI));
  else hand=blend(boltGrip,support,smooth(ramp(reload,.90,1)));
  Object.assign(support,hand);
  const remove=smooth(ramp(reload,.21,.40)),insert=smooth(ramp(reload,.56,.70));
  const loose=reload<.5?remove:1-insert;
  magazineRotation.x=.22*loose;magazineRotation.z=-.12*loose;
  if(reload>=.21&&reload<.70){
   supportRotation.x=magazineRotation.x;supportRotation.z=magazineRotation.z-.1;
   const handContact=rotate(WEAPON_CONTACTS.handMagazine,supportRotation),magContact=rotate(WEAPON_CONTACTS.magazine,magazineRotation);
   magazine.x=hand.x+handContact.x-magContact.x;
   magazine.y=hand.y+handContact.y-magContact.y+.04;
   magazine.z=hand.z+handContact.z-magContact.z+.13;
  }else if(reload>=.70&&reload<.80)supportRotation.z=-.1*(1-smooth(ramp(reload,.70,.80)));
  else if(reload>=.80&&reload<.90)supportRotation.z=0;
  else if(reload>=.90)supportRotation.z=-.1*smooth(ramp(reload,.90,1));
  magazineVisible=!(reload>.40&&reload<.54);
  bolt=reload>.80&&reload<.90?Math.sin(ramp(reload,.80,.90)*Math.PI)*.095:0;
 }else if(equip>=0){
  phase='equip';
  const raised=smooth(ramp(equip,.03,.74)),lower=1-raised;
  position.y-=.40*lower;position.z+=.12*lower;
  rotation.x+=.65*lower*motion;rotation.z-=.40*lower*motion;
  const ready= Math.sin(ramp(equip,.55,.84)*Math.PI)*(equip<.84?1:0);
  support.y+=.20*ready;support.z+=.30*ready;bolt=.07*ready;
 }else{
  const inspectAge=finite(input.inspectAt,-100000)>0?(time-input.inspectAt)/1000:100;
  if(inspectAge>=0&&inspectAge<WEAPON_ANIMATION.inspectSeconds&&!ads&&!input.fireHeld&&age>.12){
   phase='inspect';inspect=smooth(ramp(inspectAge,0,.45))*(1-smooth(ramp(inspectAge,1.95,WEAPON_ANIMATION.inspectSeconds)));
   position.x-=.18*inspect*motion;position.y+=.055*inspect*motion;position.z-=.14*inspect;
   rotation.z+=.72*inspect*motion;rotation.y-=.48*inspect*motion;rotation.x+=.12*inspect*motion;
   // Both hands rotate with the rifle; the support palm stays on its handguard.
  }
 }
 // The camera already presents aim recoil. Rotate the cosmetic ADS kick around
 // the open front sight rather than lifting that sight through the aim point.
 // This preserves kick/backward travel without hiding the target on each pulse.
 if(ads&&reload<0&&equip<0){
  const anchor=vec(0,WEAPON_VIEW_LAYOUT.sightY*WEAPON_VIEW_LAYOUT.scale,WEAPON_VIEW_LAYOUT.sightZ*WEAPON_VIEW_LAYOUT.scale);
  const turned=rotate(anchor,rotation,'YXZ');
  position.x=anchor.x-turned.x;
  position.y=WEAPON_VIEW_LAYOUT.adsY+anchor.y-turned.y;
  position.z+=anchor.z-turned.z;
 }
 return {position,rotation,support,supportRotation,magazine,magazineRotation,magazineVisible,bolt,phase,reload,equip,inspect,kick,flash:input.shotAt>0&&age<.032&&!input.reducedMotion};
}
