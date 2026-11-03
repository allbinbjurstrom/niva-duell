import test from 'node:test';
import assert from 'node:assert/strict';
import {RULES,WEAPONS,makeBody,inputState,moveBody} from '../shared/rules.mjs';
import {shotSpread} from '../shared/gunplay.mjs';
import {presentPose,validatedViewPose} from '../shared/presentation.mjs';
import {meleeStrike} from '../shared/melee.mjs';
import {ShooterEngine} from '../server/engine.mjs';
import {reconcileBody,pressMouse,normalizeControls} from '../shared/controls.mjs';
const dt=1/RULES.tickRate,close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function live(weapon='vandal'){
 let now=10000;const engine=new ShooterEngine({sections:[]},{now:()=>now,random:()=>.5}),c=engine.createTest(),p=engine.connect(c.token),party=engine.partyOf(p);
 for(const q of party.questions){engine.command(p,{type:'answer',questionId:q.id,answer:'C'});engine.command(p,{type:'next'});}
 engine.command(p,{type:'buy',weapon});engine.command(p,{type:'ready'});now+=3100;engine.tick();
 return {engine,p,target:engine.active(party).find(q=>q.bot),duel:party.duels[0],tick(){now+=dt*1000;engine.tick();}};
}
test('a snapshot gap reports the held pose time, not a later speculative presentation time',()=>{
 const b=makeBody({x:4,z:-9,yaw:0}),client=[{at:100,id:1,body:b}],server=[...client,{at:200,id:2,body:{...b,z:-8.46}}];
 const view=presentPose(client,168.75);assert.equal(view.time,100);assert.equal(view.fromId,1);assert.equal(view.toId,1);
 const validated=validatedViewPose(server,{viewTime:view.time,viewFromId:view.fromId,viewToId:view.toId},200);close(validated.z,view.body.z);
});
test('validation uses the exact received endpoints even if intermediate poses were not received',()=>{
 const b=makeBody({x:4,z:-9,yaw:0}),a={at:100,id:1,body:b},end={at:200,id:3,body:{...b,z:-8.4}};
 const server=[a,{at:150,id:2,body:{...b,z:-8.8}},end,{at:200,id:4,body:{...b,z:-8.3}}];
 const view=presentPose([a,end],175),validated=validatedViewPose(server,{viewTime:view.time,viewFromId:view.fromId,viewToId:view.toId},200);close(validated.z,view.body.z);
 const held=validatedViewPose(server,{viewTime:200,viewFromId:3,viewToId:3},200);close(held.z,-8.4);
 assert.equal(validatedViewPose(server,{viewTime:0,viewFromId:1,viewToId:3},500),null);
 assert.equal(validatedViewPose(server,{viewTime:175,viewFromId:99,viewToId:3},200),null);
});
test('a delayed trigger keeps its validated standing or lateral origin after later movement',()=>{
 for(const mode of ['crouch','strafe']){
  const s=live(),inputs=[];let click;
  for(let seq=1;seq<=20;seq++){
   if(seq===1)s.engine.command(s.p,{type:'input',seq,yaw:-Math.PI/2});
   s.tick();const state=s.engine.snapshot(s.p);
   if(seq===5)click={triggerViewTime:state.now,triggerFromId:state.duel.opponent.poseId,triggerToId:state.duel.opponent.poseId,triggerOwnSeq:5,triggerOwnAlpha:1,triggerYaw:-Math.PI/2,triggerPitch:0};
   if(seq>=2)inputs.push({type:'input',seq,yaw:-Math.PI/2,crouch:mode==='crouch'&&seq>=10,strafe:mode==='strafe'&&seq>=10?1:0,firePress:seq>=6?1:0,fire:false,...(seq>=6?click:{})});
  }
  for(const input of inputs)s.engine.command(s.p,input);s.tick();
  const shot=s.duel.events.find(e=>e.shooterId===s.p.id);assert.ok(shot);close(shot.origin[0],-4);close(shot.origin[1],1.62);close(shot.origin[2],-9);assert.equal(s.target.body.health,0,mode);
 }
});
test('300–600 ms timeout changes epoch, discards stale commands and cannot double-replay movement',()=>{
 for(const gap of [40,64,77])for(const stop of [false,true]){
  const s=live(),old=[];s.engine.command(s.p,{type:'input',seq:1,forward:1,yaw:-Math.PI/2});s.tick();
  for(let i=2;i<=gap;i++){old.push({type:'input',seq:i,epoch:0,forward:stop&&i>20?0:1,yaw:-Math.PI/2});s.tick();}
  const timedOut=s.engine.snapshot(s.p);assert.equal(timedOut.self.motionEpoch,1);assert.equal(timedOut.self.motionStale,true);const stoppedX=s.p.body.x;
  for(const command of old)s.engine.command(s.p,command);assert.equal(s.p.pendingInputs.length,0);
  const fresh=[];for(let i=1;i<=8;i++){const input={type:'input',seq:gap+i,epoch:1,forward:stop?0:1,yaw:-Math.PI/2};fresh.push(inputState(input));s.engine.command(s.p,input);}
  s.tick();const state=s.engine.snapshot(s.p);assert.equal(state.self.motionStale,false);assert.equal(state.self.body.seq,gap+8);close(s.p.body.x-stoppedX,stop?0:5.4*dt);
  const result=reconcileBody(state.self.body,fresh.map(input=>({input})),WEAPONS.vandal,state.self.previousBody);assert.equal(result.pending.length,0);close(result.body.x,s.p.body.x);
 }
});
test('current and previous confirmed poses describe the same render interval as server history',()=>{
 const s=live();for(let seq=1;seq<=10;seq++){s.engine.command(s.p,{type:'input',seq,forward:1,yaw:-Math.PI/2});s.tick();}
 const state=s.engine.snapshot(s.p),alpha=.4,pose=s.p.motion.presentationAt(state.self.body.seq,alpha,s.engine.now());
 close(pose.x,state.self.previousBody.x+(state.self.body.x-state.self.previousBody.x)*alpha);
});
test('tagging cannot create movement error in a body stopped by a wall',()=>{
 const b=makeBody({x:-3.32,z:0,yaw:-Math.PI/2});b.tagged=true;const input=inputState({forward:1,yaw:-Math.PI/2});moveBody(b,input,dt,WEAPONS.vandal);close(b.vx,0);
 close(shotSpread(WEAPONS.vandal,b,input,0),WEAPONS.vandal.spread);
 b.x=-4;b.z=-9;moveBody(b,input,dt,WEAPONS.vandal);assert.ok(shotSpread(WEAPONS.vandal,b,input,0)>WEAPONS.vandal.spread);
});
test('Spectre total stationary spread caps at 1.3 degrees including its base error',()=>{
 const b=makeBody({x:-4,z:-9,yaw:0});close(shotSpread(WEAPONS.spectre,b,inputState({}),100)*180/Math.PI,1.3);
 assert.ok(shotSpread(WEAPONS.spectre,b,inputState({aim:true}),100)<shotSpread(WEAPONS.spectre,b,inputState({}),100));
});
test('knife primary attack has a wider real hit volume and slightly longer range than secondary',()=>{
 const origin=[-4,1.62,-9],target=makeBody({x:-2.4,z:-8.45,yaw:0});
 assert.equal(meleeStrike(origin,-Math.PI/2,0,target,false).hit,true);assert.equal(meleeStrike(origin,-Math.PI/2,0,target,true).hit,false);
 target.x=-2;target.z=-9; // Visible head enters1.9m primary reach; remains beyond1.6m secondary.assert.equal(meleeStrike(origin,-Math.PI/2,0,target,false).hit,true);assert.equal(meleeStrike(origin,-Math.PI/2,0,target,true).hit,false);
});
test('every knife contact ray respects cover rather than expanding a target through walls',()=>{
 const target=makeBody({x:-2,z:0,yaw:0});assert.equal(meleeStrike([-4,1.62,0],-Math.PI/2,0,target,false).hit,false);
 assert.equal(meleeStrike([-3.4,1.62,0],-Math.PI/2,0,null,false).wall,true);
});
test('ADS buttons cannot overwrite a pending firing click or its original aiming mode',()=>{
 assert.equal(inputState({triggerZoomLevel:1,zoomLevel:2}).triggerZoomLevel,1);assert.equal(inputState({triggerZoomLevel:2,zoomLevel:1}).triggerZoomLevel,2);assert.equal(inputState({zoomLevel:2}).triggerZoomLevel,2);
 for(const weapon of [WEAPONS.operator,WEAPONS.vandal]){
  const input=inputState({ownSeq:5,ownAlpha:.4,viewTime:100,viewFromId:1,viewToId:2});
  assert.equal(pressMouse(input,weapon,0,normalizeControls(),100),'primary');assert.equal(input.triggerOwnSeq,5);assert.equal(input.triggerAim,false);
  input.ownSeq=10;input.viewFromId=3;input.viewToId=4;
  assert.equal(pressMouse(input,weapon,2,normalizeControls(),150),null);assert.equal(input.aim,true);assert.equal(input.firePress,1);assert.equal(input.triggerOwnSeq,5);assert.equal(input.triggerFromId,1);assert.equal(input.triggerAim,false);
 }
});
test('later ADS cannot turn a hip-fired Operator click into a perfect scoped shot or undo a scoped click',()=>{
 for(const aimedAtClick of [false,true]){
  const s=live('operator'),input=inputState({aim:aimedAtClick,yaw:-Math.PI/2});pressMouse(input,WEAPONS.operator,0,normalizeControls(),s.engine.now());
  input.aim=!aimedAtClick;s.engine.command(s.p,{...input,type:'input',seq:1});s.tick();assert.equal(s.target.body.health,aimedAtClick?0:100);
 }
});
test('Guardian ADS has precise initial taps, builds error in rapid follow-up shots, and recovers',()=>{
 const body=makeBody({x:-4,z:-9,yaw:0}),aim=inputState({aim:true});close(shotSpread(WEAPONS.guardian,body,aim,0),0);close(shotSpread(WEAPONS.guardian,body,aim,2),0);assert.ok(shotSpread(WEAPONS.guardian,body,aim,10)>0);
 const s=live('guardian');let seq=0;for(let i=1;i<=10;i++)for(let j=0;j<25;j++){s.engine.command(s.p,{type:'input',seq:++seq,aim:true,firePress:i,yaw:0});s.tick();}
 assert.ok(s.p.shotCount>3);assert.ok(shotSpread(WEAPONS.guardian,s.p.body,aim,s.p.shotCount)>0);
 for(let i=0;i<128;i++){s.engine.command(s.p,{type:'input',seq:s.p.input.seq+1,aim:true,firePress:10,yaw:0});s.tick();}
 assert.equal(s.p.shotCount,0);close(shotSpread(WEAPONS.guardian,s.p.body,aim,s.p.shotCount),0);
});
