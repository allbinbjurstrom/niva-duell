import test from 'node:test';
import assert from 'node:assert/strict';
import {RULES,WEAPONS,makeBody,inputState,moveBody} from '../shared/rules.mjs';
import {stanceDimensions,isAudibleGroundMotion,GAIT,createGaitState,resetGait,advanceGait} from '../shared/movement.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const spawn=()=>makeBody({x:-4,z:-9,yaw:-Math.PI/2});

test('Shift remains silent after the walk-speed correction for rifles and knife',()=>{
  for(const weapon of [WEAPONS.vandal,WEAPONS.knife]){
    const b=spawn();moveBody(b,inputState({forward:1,walk:true,yaw:-Math.PI/2}),1/128,weapon);
    assert.ok(Math.hypot(b.vx,b.vz)>3,'reproduces the previous fixed-threshold mistake');
    assert.equal(isAudibleGroundMotion(b,weapon,{walk:true}),false);
    moveBody(b,inputState({forward:1,yaw:-Math.PI/2}),1/128,weapon);
    assert.equal(isAudibleGroundMotion(b,weapon,{walk:false}),true);
  }
});

test('published movement mode beats speed inference while crouch, air, death and a wall stay quiet',()=>{
  const b={...spawn(),vx:1.4,walk:false,tagged:true};
  assert.equal(isAudibleGroundMotion(b,WEAPONS.vandal),true);
  assert.equal(isAudibleGroundMotion({...b,walk:true,vx:6.75},WEAPONS.vandal),false);
  assert.equal(isAudibleGroundMotion({...b,crouch:true},WEAPONS.vandal),false);
  assert.equal(isAudibleGroundMotion({...b,grounded:false},WEAPONS.vandal),false);
  assert.equal(isAudibleGroundMotion({...b,health:0},WEAPONS.vandal),false);
  assert.equal(isAudibleGroundMotion({...b,vx:0,vz:0},WEAPONS.vandal),false);
  assert.equal(isAudibleGroundMotion(b,WEAPONS.vandal,{active:false}),false);
  assert.equal(isAudibleGroundMotion({...b,walk:true},WEAPONS.vandal,{walk:false}),true);
  assert.equal(advanceGait(createGaitState(),{...b,health:0},WEAPONS.vandal).intensity,0);
});

test('legacy poses infer quiet motion against the equipped weapon rather than an absolute threshold',()=>{
  const {walk,...legacy}=spawn();
  assert.equal(isAudibleGroundMotion({...legacy,vx:3.24},WEAPONS.vandal),false);
  assert.equal(isAudibleGroundMotion({...legacy,vx:4.05},WEAPONS.knife),false);
  assert.equal(isAudibleGroundMotion({...legacy,vx:5.4},WEAPONS.vandal),true);
});

test('crouch display scale, hit height and eye share one stance definition',()=>{
  const standing=stanceDimensions(false,RULES),crouch=stanceDimensions(true,RULES);
  close(standing.height,1.8);close(standing.eye,1.62);close(standing.visualScale,1);
  close(crouch.height,1.22);close(crouch.eye,1.03);close(crouch.visualScale*standing.height,crouch.height);
  assert.notEqual(crouch.visualScale,.7);assert.ok(crouch.eye<crouch.height);
});

test('gait phase and contact counts are independent of render FPS',()=>{
  let reference;
  for(const fps of [30,60,120,144,240]){
    const b={...spawn(),vx:5.4,walk:false},state=resetGait(createGaitState(),b);let contacts=0,result;
    for(let frame=1;frame<=fps*2;frame++){b.x=-4+5.4*frame/fps;result=advanceGait(state,b,WEAPONS.vandal);contacts+=result.steps;}
    close(result.distance,10.8);assert.equal(contacts,Math.floor(10.8/GAIT.stepDistance));
    if(reference)close(result.phase,reference.phase);else reference=result;
  }
});

test('gait follows actual path length, freezes in air and does not add steps for a resync teleport',()=>{
  const b={...spawn(),x:0,z:0,vx:5.4,walk:false},state=resetGait(createGaitState(),b);let contacts=0;
  for(const [x,z] of [[1,0],[1,1],[0,1],[0,0]]){b.x=x;b.z=z;contacts+=advanceGait(state,b,WEAPONS.vandal).steps;}
  close(state.distance,4);assert.equal(contacts,2);
  b.grounded=false;b.x=.5;advanceGait(state,b,WEAPONS.vandal);close(state.distance,4);
  b.grounded=true;b.x=20;assert.equal(advanceGait(state,b,WEAPONS.vandal).steps,0);close(state.distance,4);
  b.x=20.5;advanceGait(state,b,WEAPONS.vandal);close(state.distance,4.5);
  resetGait(state,b);close(state.distance,0);
});
test('authoritative gait advances by real ground distance and stays still against cover or in air',()=>{
 const b=makeBody({x:-4,z:-9,yaw:-Math.PI/2});for(let i=0;i<128;i++)moveBody(b,inputState({yaw:-Math.PI/2,forward:1}),1/128,WEAPONS.vandal);close(b.gaitPhase,5.4/GAIT.stepDistance*Math.PI);
 const wall=makeBody({x:-3-RULES.radius,z:0,yaw:-Math.PI/2});for(let i=0;i<64;i++)moveBody(wall,inputState({yaw:-Math.PI/2,forward:1}),1/128,WEAPONS.vandal);close(wall.gaitPhase,0);
 const phase=b.gaitPhase;moveBody(b,inputState({yaw:-Math.PI/2,forward:1,jump:true}),1/128,WEAPONS.vandal);assert.equal(b.grounded,false);close(b.gaitPhase,phase);
});
