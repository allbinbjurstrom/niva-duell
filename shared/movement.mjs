// Presentation helpers only. They do not smooth or alter authoritative movement.
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function stanceDimensions(crouched,rules={}){
  const standingHeight=Math.max(.1,finite(rules.height,1.8));
  const height=crouched?clamp(finite(rules.crouchHeight,1.22),.1,standingHeight):standingHeight;
  const eye=clamp(finite(crouched?rules.crouchEye:rules.eye,crouched?1.03:1.62),.05,height-.02);
  return {height,eye,visualScale:height/standingHeight};
}

// Read the actual simulated pose, rather than the requested key combination.
export function movementStatus(body){
  const speed=Math.hypot(finite(body?.vx,0),finite(body?.vz,0));
  const mode=body?.grounded===false?'I LUFTEN':body?.crouch?'HUKAR':body?.walk?'GÅR':speed>.01?'SPRINGER':'STILLA';
  return {mode,speed};
}

export function isAudibleGroundMotion(body,weapon,options={}){
  if(!body||options.active===false||body.grounded!==true||body.health<=0||body.crouch===true||options.crouch===true)return false;
  const speed=Math.hypot(finite(body.vx,0),finite(body.vz,0));
  if(speed<=.01)return false;
  const walk=typeof options.walk==='boolean'?options.walk:typeof body.walk==='boolean'?body.walk:null;
  if(walk!==null)return !walk;
  // Published stance flags are preferred. This fallback supports older poses only.
  const runSpeed=Math.max(0,finite(weapon?.runSpeed,0)),walkFraction=clamp(finite(options.walkSpeed,.6),0,1);
  return runSpeed>0&&speed>runSpeed*walkFraction+.001;
}

// The existing 365-ms rifle cadence corresponds to a 1.971-m contact spacing.
// It is an explicit cosmetic calibration, not a claimed Riot animation value.
export const GAIT=Object.freeze({stepDistance:1.971,maxFrameDistance:1.5});

export function createGaitState(){return {x:null,z:null,distance:0};}

export function resetGait(state,body){
  state.x=Number.isFinite(body?.x)?body.x:null;state.z=Number.isFinite(body?.z)?body.z:null;state.distance=0;
  return state;
}

export function advanceGait(state,body,weapon,options={}){
  const stepDistance=clamp(finite(options.stepDistance,GAIT.stepDistance),.1,10);
  const maxFrameDistance=Math.max(.1,finite(options.maxFrameDistance,GAIT.maxFrameDistance));
  const x=finite(body?.x,state.x??0),z=finite(body?.z,state.z??0);
  const distance=state.x===null||state.z===null?0:Math.hypot(x-state.x,z-state.z);
  state.x=x;state.z=z;
  const before=Math.floor(state.distance/stepDistance+1e-9);
  if(body?.grounded===true&&body.health>0&&distance<=maxFrameDistance)state.distance+=distance;
  const after=Math.floor(state.distance/stepDistance+1e-9),crossings=after-before;
  const speed=Math.hypot(finite(body?.vx,0),finite(body?.vz,0)),runSpeed=Math.max(.01,finite(weapon?.runSpeed,5.4));
  const audible=isAudibleGroundMotion(body,weapon,options);
  return {phase:state.distance/stepDistance*Math.PI,distance:state.distance,intensity:body?.grounded===true&&body.health>0?clamp(speed/runSpeed,0,1):0,
    audible,step:crossings>0&&audible,steps:audible?crossings:0,foot:after%2?'left':'right'};
}
