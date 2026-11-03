import {stanceDimensions} from './movement.mjs';

/** @typedef {{id:string,zone:0|1|2,size:[number,number,number],position:[number,number,number],color:string}} AgentPart */

/**
 * Visible, damageable boxes in the actor's local yaw space; forward is -Z.
 * No rotation, animation, enclosing hull or invisible connector is implied.
 * @param {boolean} crouch
 * @param {{height?:number,crouchHeight?:number,eye?:number,crouchEye?:number}} [rules]
 * @returns {AgentPart[]}
 */
export function agentParts(crouch,rules={}){
  const height=stanceDimensions(crouch,rules).height;
  /** @type {AgentPart[]} */
  const parts=[
    {id:'head',zone:0,size:[.36,.36,.32],position:[0,height-.18,0],color:'#e6b48f'},
    {id:'neck',zone:1,size:[.16,.10,.16],position:[0,height-.41,0],color:'#344b50'},
    {id:'chest',zone:1,size:[.48,.52,.28],position:[0,height-.72,crouch?.08:0],color:'#3b686b'},
    {id:'pelvis',zone:1,size:[.42,.20,.26],position:[0,crouch?.36:.72,crouch?.12:0],color:'#263f4b'}
  ];
  for(const side of [-1,1]){
    const id=side<0?'left':'right';
    parts.push(
      {id:`${id}-upper-arm`,zone:1,size:[.15,.28,.20],position:[side*.295,height-.64,-.035],color:'#426e71'},
      {id:`${id}-forearm`,zone:1,size:[.14,.16,.40],position:[side*.25,height-.79,-.22],color:'#2c4957'},
      {id:`${id}-hand`,zone:1,size:[.13,.14,.14],position:[side*.25,height-.79,-.43],color:'#b98b6b'},
      // Crouched thighs turn along Z and move forward of the lowered hips.
      // Segment boxes stay axis aligned, so rendering and ray tests agree.
      {id:`${id}-thigh`,zone:2,size:crouch?[.17,.22,.28]:[.17,.28,.22],position:[side*.115,crouch?.35:.48,crouch?-.05:0],color:'#314b56'},
      {id:`${id}-shin`,zone:2,size:[.15,.28,.18],position:[side*.115,.20,crouch?-.16:0],color:'#3b5660'},
      {id:`${id}-boot`,zone:2,size:[.19,.13,.30],position:[side*.115,.065,crouch?-.20:-.04],color:'#172e3a'}
    );
  }
  return parts;
}

/**
 * Distance-driven walking pose shared by rendering and authoritative hits.
 * gaitPhase is supplied by movement/history, never a local animation clock.
 * The small offsets are our presentation choice, not measured Riot motion.
 * @param {{crouch?:boolean,gaitPhase?:number,vx?:number,vz?:number,grounded?:boolean,health?:number}} [body]
 * @param {{height?:number,crouchHeight?:number,eye?:number,crouchEye?:number}} [rules]
 * @returns {AgentPart[]}
 */
export function agentPartsForBody(body={},rules={}){
  const parts=agentParts(body.crouch===true,rules);
  if(body.grounded!==true||body.health<=0||!Number.isFinite(body.gaitPhase)||!Number.isFinite(body.vx)||!Number.isFinite(body.vz))return parts;
  const speed=Math.hypot(body.vx,body.vz);
  if(!Number.isFinite(speed)||speed<=.01)return parts;
  const intensity=Math.min(1,speed/5.4)*(body.crouch?.65:1),phase=Math.sin(body.gaitPhase);
  for(const part of parts){
    if(part.zone!==2)continue;
    const swing=(part.id.startsWith('left-')?phase:-phase)*intensity;
    const thigh=part.id.endsWith('-thigh'),boot=part.id.endsWith('-boot');
    // Preserve the lateral leg gap; move each visible box itself, not a hull.
    part.position[2]-=swing*(thigh?.025:boot?.070:.050);
    part.position[1]+=Math.max(0,swing)*(thigh?.008:boot?.035:.020);
  }
  return parts;
}
