import {RULES,clamp} from './rules.mjs';
import {vandalSpreadDegrees,vandalRecoilDegrees} from './vandal-profile.mjs';

export function shotDeadline(previous,now,rate,slack=1000/RULES.tickRate+1){
  const period=1000/rate;
  return previous>0&&now>=previous&&now-previous<=slack?previous+period:now+period;
}

export function fireProfile(weapon,input,alternate=false){
  const burst=alternate&&weapon.burst>0;
  return {pellets:burst?weapon.burst:1,rate:weapon.melee&&alternate?1:burst?weapon.burstRate:weapon.rate*(input.aim&&weapon.zoom>1?weapon.adsRate:1)};
}
export function shotSpread(weapon,body,input,shotCount,alternate=false){
  if(weapon.melee)return 0;
  const ads=input.aim&&weapon.zoom>1;
  const speed=Math.hypot(body.vx,body.vz),referenceSpeed=weapon.runSpeed*(body.tagged?RULES.tagSpeed:1);
  const moving=speed>.01&&speed>referenceSpeed*weapon.deadzone,walking=speed<=referenceSpeed*RULES.walkSpeed+.001;
  if(alternate&&weapon.burst>0){
    const burstError=shotCount===0?1.9:shotCount===1?2.5:6;
    return (burstError*(input.crouch?.9:1)+(moving?(input.crouch?0:walking?.6:1.5):0)+(!body.grounded?2.25:body.landPenalty>0?7:0))*Math.PI/180;
  }
  const movement=moving?(input.crouch?weapon.crouchError:walking?weapon.walkError:weapon.runError):0;
  const air=!body.grounded?weapon.jumpError:body.landPenalty>0?7:0;
  if(weapon.id==='vandal')return (vandalSpreadDegrees(shotCount,{ads,crouch:input.crouch})+movement+air)*Math.PI/180;
  const bloom=Math.max(0,shotCount-weapon.tapProtected+1)*(weapon.id==='spectre'?.1:.15)*Math.PI/180;
  const base=weapon.spread*(ads?weapon.adsSpread:1),bloomScale=ads&&weapon.adsSpread>0?weapon.adsSpread:1;
  const stationary=Math.min(weapon.maxSpread*Math.PI/180*bloomScale,base+bloom*bloomScale)*(input.crouch?.75:1);
  return stationary+(movement+air)*Math.PI/180;
}
export function advanceRecoil(player,weapon,now,random,input={},body=player.body){
  player.shotCount++;
  player.recoilPitch=Math.min(.24,player.recoilPitch+weapon.recoil*(1+Math.min(player.shotCount,12)*.045));
  if(!player.recoilSide){player.recoilSide=random()<.5?-1:1;player.yawSwitchAt=now;}
  else if(player.shotCount>weapon.protectedShots&&now-player.yawSwitchAt>=weapon.yawSwitch*1000&&random()<weapon.yawChance){player.recoilSide*=-1;player.yawSwitchAt=now;}
  if(weapon.id==='vandal'){
    const profile=vandalRecoilDegrees(player.shotCount,{ads:input.aim,crouch:body?.crouch,running:Math.hypot(body?.vx??0,body?.vz??0)>weapon.runSpeed*RULES.walkSpeed+.001&&!body?.walk});
    const radians=Math.PI/180;player.recoilPitch=profile.pitch*radians;player.recoilYaw=clamp(player.recoilYaw+player.recoilSide*profile.yawStep*radians,-profile.yaw*radians,profile.yaw*radians);return;
  }
  const curve=player.shotCount<=weapon.protectedShots?.04:.22;
  player.recoilYaw=clamp(player.recoilYaw+player.recoilSide*weapon.recoil*curve,-.045,.045);
}
