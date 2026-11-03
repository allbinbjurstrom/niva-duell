import test from 'node:test';
import assert from 'node:assert/strict';
import {DEMO_WALL} from '../shared/training-layout.mjs';
import {RULES,wallDistance} from '../shared/rules.mjs';
test('the entire spray board has clear authoritative sight from standing/crouch across the start line',()=>{
 const w=DEMO_WALL;assert.equal(w.x-w.spawn.x,w.distance);let rays=0;
 for(const eye of [RULES.eye,RULES.crouchEye])for(const side of [-3,0,3])for(let yi=0;yi<7;yi++)for(let zi=0;zi<13;zi++){
  const origin=[w.spawn.x,eye,w.z+side],end=[w.x,w.bottom+w.height*yi/6,w.z-w.width/2+w.width*zi/12],delta=end.map((n,i)=>n-origin[i]),distance=Math.hypot(...delta),direction=delta.map(n=>n/distance);
  assert.ok(Math.abs(wallDistance(origin,direction)-distance)<1e-7,`blocked board sample ${yi}/${zi} at eye ${eye}, side ${side}`);rays++;
 }
 assert.equal(rays,546);
});
