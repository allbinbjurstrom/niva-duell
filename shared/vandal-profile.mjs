// Numeric source: original game-file extraction, build 13.09.00.5777412.
// Sampling and mapping these keys onto shot counts/absolute angles are ours.
const keys=rows=>Object.freeze(rows.map(row=>Object.freeze(row)));
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export const VANDAL_CURVES=Object.freeze({
  error:keys([[0,.25],[1,.3],[2,.35],[5,1]]),
  pitch:keys([[0,0],[1,.4],[2,.9],[7,7.6],[8.7737,7.4554],[10.4892,8.0837],[12.8023,7.5347],[14.8712,8.163],[17.6084,7.7727],[19.8198,8.3622],[22.2024,7.9314]]),
  yaw:keys([[0,0],[3,.15],[12.3526,2],[14.9531,1.9382],[17.1676,2.081],[19.3089,1.9382],[21.8081,2.1193],[24.0538,1.9198]]),
  walking:keys([[0,0],[.275,3],[.601,5]]),
  crouching:keys([[0,0],[.29,0],[.3,.8]])
});

export const VANDAL_PROFILE=Object.freeze({
  recoverySeconds:.375,adsSpreadScale:1.15,adsSpreadOffset:-.13,
  adsRecoilScale:.7,crouchScale:.85,runningPitchScale:1.8,
  protectedShots:6,yawSwitchSeconds:.6,yawSwitchChance:.1,
  // Calibration, rather than extracted motor equations:
  recoilHoldSeconds:.125,hipCameraFactor:.35,minYawStepDegrees:.2
});

/** Piecewise linear, constant outside the supplied domain. Values are degrees. */
export function sampleVandalCurve(name,value){
  const curve=VANDAL_CURVES[name];if(!curve)throw new RangeError(`Unknown Vandal curve: ${name}`);
  const x=Math.max(0,finite(value));
  if(x<=curve[0][0])return curve[0][1];
  for(let i=1;i<curve.length;i++){
    const [rightX,rightY]=curve[i],[leftX,leftY]=curve[i-1];
    if(x<=rightX)return leftY+(rightY-leftY)*(x-leftX)/(rightX-leftX);
  }
  return curve.at(-1)[1];
}

/** shotCount = shots already fired before this bullet; no movement error here. */
export function vandalSpreadDegrees(shotCount,{ads=false,crouch=false}={}){
  const spread=sampleVandalCurve('error',shotCount);
  return Math.max(0,ads?spread*VANDAL_PROFILE.adsSpreadScale+VANDAL_PROFILE.adsSpreadOffset:spread)*(crouch?VANDAL_PROFILE.crouchScale:1);
}

/** Absolute pitch and unsigned yaw envelope; the server owns yaw direction. */
export function vandalRecoilDegrees(shotCount,{ads=false,crouch=false,running=false}={}){
  const count=Math.max(0,finite(shotCount)),scale=(ads?VANDAL_PROFILE.adsRecoilScale:1)*(crouch?VANDAL_PROFILE.crouchScale:1);
  const yaw=sampleVandalCurve('yaw',count);
  return {pitch:sampleVandalCurve('pitch',count)*scale*(running?VANDAL_PROFILE.runningPitchScale:1),yaw:yaw*scale,
    yawStep:Math.max(VANDAL_PROFILE.minYawStepDegrees,Math.abs(yaw-sampleVandalCurve('yaw',Math.max(0,count-1))))*scale};
}

/**
 * Radian offsets. Call every physics tick, with idleSeconds measured at tick end.
 * Hold through normal hip/ADS intervals, then reach zero by recoverySeconds.
 * This deadline-based return is a calibration; it is not Riot's decay equation.
 */
export function recoverVandalRecoil(pitchRadians,yawRadians,idleSeconds,dt){
  const pitch=Math.max(0,finite(pitchRadians)),yaw=finite(yawRadians),idle=Math.max(0,finite(idleSeconds));
  const step=clamp(finite(dt),0,1),end=VANDAL_PROFILE.recoverySeconds,hold=VANDAL_PROFILE.recoilHoldSeconds;
  if(idle>=end)return {pitch:0,yaw:0,recovered:true};
  if(idle<=hold||step===0)return {pitch,yaw,recovered:false};
  const start=Math.max(hold,idle-step),factor=clamp((end-idle)/(end-start),0,1);
  return {pitch:pitch*factor,yaw:yaw*factor,recovered:false};
}
