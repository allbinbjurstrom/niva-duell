import {RULES,clamp} from './rules.mjs';

export const PRESENTATION=Object.freeze({delay:2000/RULES.snapshotRate,maxRewind:150});
export function blendPose(a,b,alpha){
  const t=clamp(alpha,0,1),result={...b};
  for(const key of ['x','y','z','vx','vy','vz','pitch'])result[key]=a[key]+(b[key]-a[key])*t;
  const phaseA=Number.isFinite(a.gaitPhase)?a.gaitPhase:0,phaseB=Number.isFinite(b.gaitPhase)?b.gaitPhase:0;result.gaitPhase=phaseA+(phaseB-phaseA)*t;
  const delta=Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw));result.yaw=a.yaw+delta*t;result.crouch=t<.5?a.crouch:b.crouch;return result;
}
export function rememberPose(samples,at,body,id=0){
  const sample={at,id,body:{...body}};
  if(samples.at(-1)?.at===at&&samples.at(-1)?.id===id)samples[samples.length-1]=sample;else samples.push(sample);
  if(samples.length>64)samples.splice(0,samples.length-64);
}
export function presentPose(samples,desired){
  if(!samples.length)return null;
  const first=samples[0],last=samples.at(-1),time=clamp(desired,first.at,last.at);
  if(time>=last.at)return {body:{...last.body},time:last.at,fromId:last.id??0,toId:last.id??0};
  for(let i=1;i<samples.length;i++)if(time<samples[i].at){const a=samples[i-1],b=samples[i];return {body:blendPose(a.body,b.body,(time-a.at)/Math.max(.001,b.at-a.at)),time,fromId:a.id??0,toId:b.id??0};}
  return {body:{...first.body},time:first.at,fromId:first.id??0,toId:first.id??0};
}
export function validatedViewPose(samples,input,now){
  if(input.viewTime<now-PRESENTATION.maxRewind||input.viewTime>now)return null;
  const a=samples.find(sample=>sample.id===input.viewFromId),b=samples.find(sample=>sample.id===input.viewToId);
  if(!a||!b||b.at<a.at||input.viewTime<a.at||input.viewTime>b.at)return null;
  return blendPose(a.body,b.body,(input.viewTime-a.at)/Math.max(.001,b.at-a.at));
}
export function samplePose(samples,at){
  if(!samples.length)return null;
  if(at<=samples[0].at)return {...samples[0].body};
  for(let i=1;i<samples.length;i++)if(at<=samples[i].at){const a=samples[i-1],b=samples[i];return blendPose(a.body,b.body,(at-a.at)/Math.max(.001,b.at-a.at));}
  return {...samples.at(-1).body};
}
