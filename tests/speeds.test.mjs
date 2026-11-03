import test from 'node:test';
import assert from 'node:assert/strict';
import {RULES,WEAPONS,inputState,makeBody,moveBody} from '../shared/rules.mjs';
import {shotSpread} from '../shared/gunplay.mjs';

const dt=1/128;
const references={classic:5.7375,ghost:5.7375,sheriff:5.4,spectre:5.7375,guardian:5.4,phantom:5.4,vandal:5.4,operator:5.13,knife:6.75};
const directions=[{yaw:-Math.PI/2,forward:1},{yaw:Math.PI/2,forward:-1},{yaw:0,strafe:1},{yaw:-Math.PI/4,forward:1,strafe:1}];

test('one-second distance and ten-meter travel match movement references in all ground directions',()=>{
 for(const [id,run] of Object.entries(references))for(const walk of [false,true])for(const direction of directions){
  const expected=run*(walk?.6:1),b=makeBody({x:-4,z:-9,yaw:direction.yaw}),input=inputState({...direction,walk});
  for(let tick=0;tick<128;tick++)moveBody(b,input,dt,WEAPONS[id]);
  assert.ok(Math.abs(b.x+4-expected)<1e-8,`${id} walk=${walk}: one-second distance`);
  let ticks=128;while(b.x<6-1e-9&&ticks<1500){moveBody(b,input,dt,WEAPONS[id]);ticks++;}
  assert.ok(Math.abs(ticks*dt-10/expected)<=dt+1e-9,`${id} walk=${walk}: ten-meter time`);
  assert.ok(Math.abs(b.z+9)<1e-8,`${id}: normalized direction`);
 }
});

test('the corrected Shift speed remains walking accuracy, including while tagged',()=>{
 for(const tagged of [false,true]){
  const w=WEAPONS.vandal,b=makeBody({x:-4,z:-9,yaw:-Math.PI/2});b.tagged=tagged;
  const input=inputState({yaw:-Math.PI/2,forward:1,walk:true});moveBody(b,input,dt,w);
  assert.ok(Math.abs(b.vx-3.24*(tagged?RULES.tagSpeed:1))<1e-8);
  const standing=makeBody({x:-4,z:-9,yaw:-Math.PI/2});
  assert.ok(Math.abs(shotSpread(w,b,input,0)-shotSpread(w,standing,input,0)-3*Math.PI/180)<1e-8);
  input.walk=false;moveBody(b,input,dt,w);
  assert.ok(Math.abs(shotSpread(w,b,input,0)-shotSpread(w,standing,input,0)-6*Math.PI/180)<1e-8);
 }
});
