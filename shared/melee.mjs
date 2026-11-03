import {wallDistance,hitBody,clamp} from './rules.mjs';

// Own calibrated volumes: the public reference specifies relative width/range,
// not absolute dimensions. Each candidate ray still tests real cover first.
export const MELEE=Object.freeze({primary:{range:1.9,yaw:12*Math.PI/180,pitch:22*Math.PI/180},secondary:{range:1.6,yaw:8*Math.PI/180,pitch:18*Math.PI/180}});
export function meleeStrike(origin,yaw,pitch,target,alternate=false){
  const shape=alternate?MELEE.secondary:MELEE.primary,candidates=[];
  for(const x of [-1,-.5,0,.5,1])for(const y of [-1,0,1])candidates.push({x,y,priority:x*x+y*y});
  candidates.sort((a,b)=>a.priority-b.priority);
  let center=null;
  for(const offset of candidates){
    const a=yaw+offset.x*shape.yaw,b=clamp(pitch+offset.y*shape.pitch,-1.56,1.56),direction=[-Math.sin(a)*Math.cos(b),Math.sin(b),-Math.cos(a)*Math.cos(b)];
    const wall=wallDistance(origin,direction),limit=Math.min(shape.range,wall),hit=target?hitBody(origin,direction,target):null;
    if(!center)center={direction,distance:limit,hit:false,wall:wall<=shape.range};
    if(hit&&hit.distance<=limit)return {direction,distance:hit.distance,hit:true,wall:false};
  }
  return center;
}
