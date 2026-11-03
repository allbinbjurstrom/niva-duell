import {RULES,inputState,moveBody} from '../shared/rules.mjs';
import {blendPose,PRESENTATION} from '../shared/presentation.mjs';

// The world advances every server tick. Missing commands are predicted for a short,
// bounded interval and replaced by real commands when they arrive. Only the last
// confirmed pose is sent back as the owner's replay baseline.
export class MovementTimeline {
  constructor(body,input){this.body=body;this.sequence=input.seq;this.control={...input};this.confirmed={...body,seq:input.seq};this.confirmedPrevious={...this.confirmed};this.base={...this.confirmed};this.baseAt=0;this.frames=[];this.stale=true;this.epoch=0;this.needsResync=false;}
  step(queue,{now,dt=1/RULES.tickRate,weapon,fresh,tagged}){
    const body=this.body;
    if(!fresh){
      if(!this.stale){this.epoch++;this.needsResync=true;}
      queue.length=0;this.frames=[];this.control=inputState({seq:this.sequence,yaw:body.yaw,pitch:body.pitch,active:false,epoch:this.epoch});
      this.confirmedPrevious={...body};body.tagged=tagged;moveBody(body,this.control,dt,weapon);this.confirmed={...body};this.base={...body};this.baseAt=now;this.stale=true;return;
    }
    if(this.stale){
      if(this.needsResync&&queue.length){const latest=queue.at(-1);queue.splice(0,queue.length,latest);}
      this.frames=[];this.sequence=(queue[0]?.seq??this.confirmed.seq+1)-1;this.confirmed={...body,seq:this.sequence};this.confirmedPrevious={...this.confirmed};this.base={...this.confirmed};this.baseAt=now-dt*1000;this.control=inputState({seq:this.sequence,yaw:body.yaw,pitch:body.pitch,epoch:this.epoch});this.stale=false;this.needsResync=false;
    }
    let changed=this.frames.length;
    while(queue.length&&queue[0].seq<=this.sequence){
      const input=queue.shift(),index=this.frames.findIndex(frame=>frame.seq===input.seq);
      if(index>=0){this.frames[index].input=input;this.frames[index].real=true;changed=Math.min(changed,index);}
    }
    if(changed<this.frames.length){
      const health=body.health,shield=body.shield;
      let replay={...this.frames[changed].before,health,shield},held=this.frames[changed].input;
      for(let i=changed;i<this.frames.length;i++){
        const frame=this.frames[i];if(frame.real)held=frame.input;
        frame.input={...held,seq:frame.seq};frame.before={...replay};replay.tagged=frame.tagged;
        moveBody(replay,frame.input,frame.dt,frame.weapon);
        frame.after={...replay};if(frame.real){this.confirmed={...replay};this.confirmedPrevious={...frame.before};}
      }
      Object.assign(body,replay,{health,shield});this.control={...this.frames.at(-1).input};
    }
    const actual=queue.shift();this.sequence=actual?.seq??this.sequence+1;
    const input=actual??{...this.control,seq:this.sequence},frame={seq:this.sequence,input,real:!!actual,before:{...body},tagged,weapon,dt,at:now};
    body.tagged=tagged;moveBody(body,input,dt,weapon);frame.after={...body};this.control=input;this.frames.push(frame);
    if(actual){this.confirmed={...body};this.confirmedPrevious={...frame.before};}
    if(this.frames.length>64)this.frames.splice(0,this.frames.length-64);
  }
  presentationAt(seq,alpha,now){
    if(seq===this.base.seq&&now-this.baseAt<=PRESENTATION.maxRewind)return {...this.base};
    const frame=this.frames.find(frame=>frame.seq===seq);
    return frame&&now-frame.at<=PRESENTATION.maxRewind?blendPose(frame.before,frame.after,alpha):null;
  }
}
