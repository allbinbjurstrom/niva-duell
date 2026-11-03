import test from 'node:test';
import assert from 'node:assert/strict';
import {RULES,WEAPONS,makeBody,inputState,moveBody} from '../shared/rules.mjs';
import {MovementTimeline} from '../server/movement.mjs';
import {reconcileBody} from '../shared/controls.mjs';
import {blendPose,samplePose} from '../shared/presentation.mjs';
import {shotDeadline} from '../shared/gunplay.mjs';
import {ShooterEngine} from '../server/engine.mjs';
const dt=1/RULES.tickRate,close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`),spawn=()=>makeBody({x:-4,z:-9,yaw:-Math.PI/2});
function live(weapon='classic'){
 let now=10000;const engine=new ShooterEngine({sections:[]},{now:()=>now,random:()=>.5}),credential=engine.createTest(),p=engine.connect(credential.token),party=engine.partyOf(p);
 for(const q of party.questions){engine.command(p,{type:'answer',questionId:q.id,answer:'C'});engine.command(p,{type:'next'});}
 engine.command(p,{type:'buy',weapon});engine.command(p,{type:'ready'});now+=3100;engine.tick();
 return {engine,p,target:engine.active(party).find(q=>q.bot),duel:party.duels[0],input(fields){engine.command(p,{type:'input',seq:p.input.seq+1,yaw:0,...fields});},tick(ms=dt*1000){now+=ms;engine.tick();},wait(ms){now+=ms;}};
}
test('gravity continues through packet gaps and late confirmation does not double-count prediction',()=>{
 for(const gap of [6,13,19]){
  const body=spawn(),timeline=new MovementTimeline(body,inputState({})),queue=[inputState({seq:1,jump:true})];
  timeline.step(queue,{now:1,weapon:WEAPONS.vandal,fresh:true,tagged:false});const y=body.y,vy=body.vy;
  const pending=[];for(let i=2;i<=gap+1;i++){pending.push({input:inputState({seq:i,jump:true})});timeline.step(queue,{now:i*dt*1000,weapon:WEAPONS.vandal,fresh:true,tagged:false});}
  assert.notEqual(body.y,y);close(body.vy,vy-RULES.gravity*dt*gap);
  const replay=reconcileBody(timeline.confirmed,pending,WEAPONS.vandal);close(replay.body.y,body.y);
  queue.push(...pending.map(frame=>frame.input));timeline.step(queue,{now:200,weapon:WEAPONS.vandal,fresh:true,tagged:false});
  assert.equal(timeline.confirmed.seq,gap+1);close(timeline.confirmed.y,replay.body.y);assert.ok(body.y>timeline.confirmed.y);
 }
});
test('bursty delayed movement and jump commands reproduce the exact confirmed client trajectory',()=>{
 for(const delay of [0,3,8,19]){
  const body=spawn(),client=spawn(),timeline=new MovementTimeline(body,inputState({})),inputs=[],queue=[];
  for(let seq=1;seq<=64;seq++){const input=inputState({seq,yaw:-Math.PI/2,forward:seq<30?1:seq<40?0:-1,jump:seq>=10&&seq<15});inputs.push(input);moveBody(client,input,dt,WEAPONS.vandal);}
  for(let frame=1;frame<=64+delay;frame++){
   const index=frame-delay;if(index>=1&&index<=64)queue.push(inputs[index-1]);
   timeline.step(queue,{now:frame*dt*1000,weapon:WEAPONS.vandal,fresh:true,tagged:false});
  }
  assert.equal(timeline.confirmed.seq,64);close(timeline.confirmed.x,client.x);close(timeline.confirmed.y,client.y);close(timeline.confirmed.vy,client.vy);
 }
});
test('late movement cannot restore lost health or armor',()=>{
 const body=spawn(),timeline=new MovementTimeline(body,inputState({})),queue=[inputState({seq:1,forward:1})];
 timeline.step(queue,{now:0,weapon:WEAPONS.vandal,fresh:true,tagged:false});timeline.step(queue,{now:8,weapon:WEAPONS.vandal,fresh:true,tagged:false});
 body.health=64;body.shield=10;queue.push(inputState({seq:2,jump:true}));timeline.step(queue,{now:16,weapon:WEAPONS.vandal,fresh:true,tagged:false});assert.equal(body.health,64);assert.equal(body.shield,10);
});
test('render interpolation has constant speed across 30/60/120/144/240 FPS without exponential easing',()=>{
 for(const fps of [30,60,120,144,240]){
  let body=spawn(),previous={...body},accumulator=0;
  for(let frame=1;frame<=fps;frame++){
   accumulator+=1/fps;while(accumulator+1e-12>=dt){previous={...body};moveBody(body,inputState({forward:1,yaw:-Math.PI/2}),dt,WEAPONS.vandal);accumulator=Math.max(0,accumulator-dt);}
   const view=blendPose(previous,body,accumulator/dt);close(view.x,-4+5.4*Math.max(0,frame/fps-dt));
  }
 }
});
test('opponent presentation depends on timestamps rather than render FPS',()=>{
 const a=spawn(),b={...a,x:a.x+5.4},samples=[{at:0,body:a},{at:1000,body:b}];
 for(const fps of [30,60,120,144,240])for(let frame=0;frame<=fps;frame++){const at=1000*frame/fps;close(samplePose(samples,at).x,a.x+5.4*at/1000);}
});
test('automatic server fire keeps its configured cadence at 128 Hz',()=>{
 for(const id of ['vandal','phantom','spectre']){
  const s=live(id),gun=s.engine.gun(s.p);gun.ammo=10000;
  for(let i=0;i<1280;i++){s.input({fire:true});s.tick();}
  const expected=Math.floor((10-dt)*WEAPONS[id].rate)+1;assert.equal(10000-gun.ammo,expected,id);
 }
});
test('client shot deadlines keep the same rhythm at different frame rates and do not catch up after a long pause',()=>{
 for(const fps of [30,60,120,144,240])for(const rate of [9.75,11,13.33]){
  let next=0,count=0;for(let frame=0;frame<fps*10;frame++){const now=frame*1000/fps;if(now+1e-9>=next){next=shotDeadline(next,now,rate,1000/fps+1);count++;}}
  assert.ok(Math.abs(count-Math.ceil(rate*10))<=1,`${fps} fps, ${rate}: ${count}`);
 }
 close(shotDeadline(100,1000,10),1100);
});
test('Classic accepts a new burst inside 225 ms, including a released button, and rejects earlier taps',()=>{
 for(const inside of [true,false]){
  const s=live(),gun=s.engine.gun(s.p);s.input({altFire:true,altPress:1});s.tick();assert.equal(gun.ammo,9);
  s.wait(gun.nextShotAt-s.engine.now()-(inside?150:250));s.input({altFire:false,altPress:2});s.engine.tick();assert.equal(gun.ammo,9);
  s.wait(gun.nextShotAt-s.engine.now()+1);s.engine.tick();assert.equal(gun.ammo,inside?6:9);
  s.tick(600);assert.equal(gun.ammo,inside?6:9);
 }
});
test('reloading or releasing mouse capture cancels a queued Classic burst',()=>{
 for(const reload of [true,false]){
  const s=live(),gun=s.engine.gun(s.p);s.input({altFire:true,altPress:1});s.tick();s.wait(gun.nextShotAt-s.engine.now()-100);s.input({altFire:false,altPress:2});s.engine.tick();assert.ok(gun.bufferedAltAt);
  if(reload)s.engine.command(s.p,{type:'reload'});else{s.input({active:false,altPress:2});s.engine.tick();}
  assert.equal(gun.bufferedAltAt,0);s.tick(1800);assert.equal(gun.ammo,reload?12:9);
 }
});
test('a shot is validated against the same published moving-target pose shown to the shooter',()=>{
 const s=live('vandal'),now=s.engine.now(),old={...s.target.body};s.target.body.z=-6;
 s.p.sentOpponentPoses=[{at:now-40,id:1,body:old},{at:now-20,id:2,body:old}];s.input({fire:true,yaw:-Math.PI/2,viewTime:now-30,viewFromId:1,viewToId:2,triggerViewTime:now-30,triggerFromId:1,triggerToId:2});s.engine.tick();assert.equal(s.target.body.health,0);close(s.target.body.z,-6);
});
test('jumping from the ground can reach and land on the arena low cover',()=>{
 const b=makeBody({x:-9,z:9.2,yaw:0}),input=inputState({forward:1,jump:true});let landed=false;
 for(let i=0;i<100;i++){moveBody(b,input,dt,WEAPONS.vandal);if(b.grounded&&b.y===1.15){landed=true;break;}}
 assert.ok(landed);for(let i=0;i<32;i++)moveBody(b,inputState({}),dt,WEAPONS.vandal);close(b.y,1.15);
});
