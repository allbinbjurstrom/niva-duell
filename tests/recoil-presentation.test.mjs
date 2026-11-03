import test from 'node:test';
import assert from 'node:assert/strict';
import {createVandalRecoilPresenter} from '../shared/recoil-presentation.mjs';
import {vandalRecoilDegrees} from '../shared/vandal-profile.mjs';

const radians=Math.PI/180,epoch='duel/1/0',serverAt=1_800_000_000_000;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const snapshot=(extra={})=>({epoch,serial:0,at:serverAt,lastShot:serverAt-1000,shotCount:0,recoilPitch:0,recoilYaw:0,...extra});
function presenter(){const value=createVandalRecoilPresenter();value.sync(snapshot(),1000);return value;}

test('local Vandal pitch and camera punch appear in the shot frame without modifying aim',()=>{
  const value=presenter(),input={at:1000,aim:false,crouch:false,running:false,yaw:1.2,pitch:.2};
  const original={...input};value.predictShot(input);
  const recoil=value.sample({now:1000});
  close(recoil.pitch,.4*radians);close(recoil.cameraPitch,.4*radians*.35);
  close(recoil.yaw,0);close(recoil.cameraYaw,0);assert.equal(recoil.pending,1);
  assert.deepEqual(input,original);
  close(value.sample({now:1000,ads:true}).cameraPitch,.4*radians);
});

test('local mode and stance use the deterministic profile, and never invent yaw',()=>{
  const value=presenter();value.sync(snapshot({serial:3,shotCount:3,recoilPitch:.025,recoilYaw:-.01,lastShot:serverAt}),1000);
  value.predictShot({at:1000,aim:true,crouch:true,running:true});
  const recoil=value.sample({now:1000,ads:true});
  close(recoil.pitch,vandalRecoilDegrees(4,{ads:true,crouch:true,running:true}).pitch*radians);
  close(recoil.yaw,-.01);close(recoil.cameraYaw,-.01);
});

test('an event acknowledges a volley once and retains its presentation until the snapshot covers it',()=>{
  const value=presenter(),id=value.predictShot({at:1000});
  assert.deepEqual(value.acknowledge({epoch,serial:1,volleyId:101},1050),{first:true,predicted:true,predictionId:id});
  close(value.sample({now:1050}).pitch,.4*radians);
  assert.deepEqual(value.acknowledge({epoch,serial:1,volleyId:101},1051),{first:false,predicted:true,predictionId:id});
  assert.equal(value.sample({now:1051}).shotCount,1);
  value.sync(snapshot({serial:1,shotCount:1,recoilPitch:.4*radians,lastShot:serverAt,at:serverAt+60}),1060);
  close(value.sample({now:1060}).pitch,.4*radians);assert.equal(value.sample({now:1060}).pending,0);
});

test('snapshot before event retires the same shot once and preserves the audio receipt',()=>{
  const value=presenter(),id=value.predictShot({at:1000});
  value.sync(snapshot({serial:1,shotCount:1,recoilPitch:.4*radians,lastShot:serverAt}),1050);
  const recoil=value.sample({now:1050});
  close(recoil.pitch,.4*radians);assert.equal(recoil.shotCount,1);assert.equal(recoil.pending,0);
  assert.deepEqual(value.acknowledge({epoch,serial:1,volleyId:1},1050),{first:true,predicted:true,predictionId:id});
  close(value.sample({now:1050}).pitch,.4*radians);
});

test('multiple pending shots reconcile incrementally, without event/snapshot double counting',()=>{
  const value=presenter();value.predictShot({at:1000});value.predictShot({at:1103});
  close(value.sample({now:1103}).pitch,.9*radians);
  value.sync(snapshot({serial:1,shotCount:1,recoilPitch:.4*radians,lastShot:serverAt,at:serverAt+103}),1103);
  close(value.sample({now:1103}).pitch,.9*radians);assert.equal(value.sample({now:1103}).pending,1);
  value.acknowledge({epoch,serial:1},1103);
  value.sync(snapshot({serial:1,shotCount:1,recoilPitch:.4*radians,lastShot:serverAt,at:serverAt+110}),1110);
  close(value.sample({now:1110}).pitch,.9*radians);
  value.sync(snapshot({serial:2,shotCount:2,recoilPitch:.9*radians,lastShot:serverAt+103,at:serverAt+120}),1120);
  value.acknowledge({epoch,serial:2},1120);
  close(value.sample({now:1120}).pitch,.9*radians);assert.equal(value.sample({now:1120}).pending,0);
});

test('new rounds and motion epochs cancel old predictions and ignore late old receipts',()=>{
  const value=presenter(),oldId=value.predictShot({at:1000});
  const nextEpoch='duel/2/0';value.sync(snapshot({epoch:nextEpoch}),1020);
  assert.deepEqual(value.acknowledge({epoch,serial:1},1021),{first:false,predicted:false,predictionId:null});
  close(value.sample({now:1021}).pitch,0);assert.equal(value.sample({now:1021}).pending,0);
  const newId=value.predictShot({at:1022});assert.notEqual(newId,oldId);assert.equal(value.reject(oldId),false);
  close(value.sample({now:1022}).pitch,.4*radians);
  value.reset('duel/2/1');close(value.sample({now:1023}).pitch,0);
});

test('rejected and unconfirmed shots stop contributing within 350 ms',()=>{
  const value=presenter(),id=value.predictShot({at:1000});
  assert.equal(value.reject(id),true);assert.equal(value.reject(id),false);close(value.sample({now:1000}).pitch,0);
  value.predictShot({at:1001});assert.ok(value.sample({now:1350}).pitch>0);
  close(value.sample({now:1351}).pitch,0);assert.equal(value.sample({now:1351}).pending,0);
  // A late receipt suppresses duplicate feedback, but does not resurrect a kick.
  assert.equal(value.acknowledge({epoch,serial:1},1360).predicted,true);
  close(value.sample({now:1360}).pitch,0);
});

test('late snapshots consume expired tombstones before newer shots',()=>{
  const value=presenter(),oldId=value.predictShot({at:1000});value.sample({now:1351});
  value.predictShot({at:1352});
  value.sync(snapshot({serial:1,shotCount:0,at:serverAt+360,lastShot:serverAt}),1360);
  assert.equal(value.acknowledge({epoch,serial:1},1360).predictionId,oldId);
  const recoil=value.sample({now:1360});assert.equal(recoil.pending,1);close(recoil.pitch,.4*radians);
});

test('a fresh authoritative shot supersedes an old expired rejection',()=>{
  const value=presenter();value.predictShot({at:1000});value.sample({now:1351});
  const recentId=value.predictShot({at:1352});
  value.sync(snapshot({serial:1,shotCount:1,at:serverAt+360,lastShot:serverAt+352,recoilPitch:.4*radians}),1360);
  assert.equal(value.acknowledge({epoch,serial:1},1360).predictionId,recentId);
  const recoil=value.sample({now:1360});assert.equal(recoil.pending,0);close(recoil.pitch,.4*radians);
});

test('recovery uses server shot age across clock domains and finishes at .375 seconds',()=>{
  const value=presenter();
  // At snapshot receipt the server offset is already halfway through recovery.
  value.sync(snapshot({serial:1,shotCount:1,at:serverAt+250,lastShot:serverAt,recoilPitch:.2*radians,recoilYaw:.01}),1000);
  close(value.sample({now:1000}).pitch,.2*radians);
  close(value.sample({now:1062.5}).pitch,.1*radians);
  const recovered=value.sample({now:1125});close(recovered.pitch,0);close(recovered.yaw,0);assert.equal(recovered.shotCount,0);
  value.predictShot({at:1125});close(value.sample({now:1125}).pitch,.4*radians);
});

test('recovery resets shotCount without resetting the authoritative volley serial',()=>{
  const value=presenter();value.sync(snapshot({serial:7,shotCount:0,at:serverAt+500,lastShot:serverAt}),1000);
  value.predictShot({at:1000});close(value.sample({now:1000}).pitch,.4*radians);
  value.sync(snapshot({serial:8,shotCount:1,at:serverAt+550,lastShot:serverAt+550,recoilPitch:.4*radians}),1050);
  close(value.sample({now:1050}).pitch,.4*radians);assert.equal(value.sample({now:1050}).pending,0);
});

test('older snapshots and already covered late receipts cannot consume fresh predictions',()=>{
  const value=presenter();value.sync(snapshot({serial:2,shotCount:0,at:serverAt+500,lastShot:serverAt}),1000);
  value.predictShot({at:1000});
  assert.equal(value.sync(snapshot({serial:1,at:serverAt+499}),1001),false);
  assert.equal(value.acknowledge({epoch,serial:1},1001).predicted,false);
  close(value.sample({now:1001}).pitch,.4*radians);assert.equal(value.sample({now:1001}).pending,1);
});

test('a delayed 16 ms snapshot cannot resurrect a recovered .28-degree local tap to .40 degrees',()=>{
  const value=presenter(),id=value.predictShot({at:1000});
  close(value.sample({now:1200}).pitch,.28*radians);
  value.sync(snapshot({serial:1,shotCount:1,at:serverAt+16,lastShot:serverAt,recoilPitch:.4*radians,recoilYaw:.01}),1200);
  const after=value.sample({now:1200});close(after.pitch,.28*radians);close(after.yaw,.007);
  assert.deepEqual(value.acknowledge({epoch,serial:1},1200),{first:true,predicted:true,predictionId:id});
  close(value.sample({now:1250}).pitch,.2*radians);
  // Further snapshots of this serial retain the same known local shot time.
  value.sync(snapshot({serial:1,shotCount:1,at:serverAt+80,lastShot:serverAt,recoilPitch:.4*radians}),1250);
  close(value.sample({now:1250}).pitch,.2*radians);
  value.sync(snapshot({serial:1,shotCount:1,at:serverAt+200,lastShot:serverAt,recoilPitch:.28*radians}),1300);
  close(value.sample({now:1300}).pitch,.12*radians);
  close(value.sample({now:1375}).pitch,0);
});

test('ack before a delayed snapshot preserves local age and an expired tap stays recovered',()=>{
  const value=presenter();value.predictShot({at:1000});
  value.acknowledge({epoch,serial:1},1050);
  close(value.sample({now:1200}).pitch,.28*radians);
  value.sync(snapshot({serial:1,shotCount:1,at:serverAt+16,lastShot:serverAt,recoilPitch:.4*radians}),1200);
  close(value.sample({now:1200}).pitch,.28*radians);
  value.sync(snapshot({serial:1,shotCount:1,at:serverAt+64,lastShot:serverAt,recoilPitch:.4*radians}),1400);
  const recovered=value.sample({now:1400});close(recovered.pitch,0);assert.equal(recovered.shotCount,0);
});

test('a confirmation after the 350 ms timeout does not resurrect the final 25 ms of recovery',()=>{
  const value=presenter(),id=value.predictShot({at:1000});close(value.sample({now:1350}).pitch,0);
  value.sync(snapshot({serial:1,shotCount:1,at:serverAt+16,lastShot:serverAt,recoilPitch:.4*radians,recoilYaw:.01}),1360);
  close(value.sample({now:1360}).pitch,0);close(value.sample({now:1360}).yaw,0);
  assert.deepEqual(value.acknowledge({epoch,serial:1},1360),{first:true,predicted:true,predictionId:id});
  // The accepted count still participates in a legitimately continuing burst.
  value.predictShot({at:1361});close(value.sample({now:1361}).pitch,.9*radians);
});

test('weapon reset silences pending visuals but preserves their identity for a late snapshot and ack',()=>{
  const value=presenter(),id=value.predictShot({at:1000});
  value.resetWeapon(1010);close(value.sample({now:1010}).pitch,0);assert.equal(value.sample({now:1010}).pending,0);
  value.sync(snapshot({serial:1,shotCount:1,at:serverAt+16,lastShot:serverAt,recoilPitch:.4*radians,recoilYaw:.01}),1200);
  close(value.sample({now:1200}).pitch,0);close(value.sample({now:1200}).yaw,0);
  assert.deepEqual(value.acknowledge({epoch,serial:1},1200),{first:true,predicted:true,predictionId:id});
  assert.equal(value.acknowledge({epoch,serial:1},1201).first,false);
  // Another stale snapshot of that shot cannot restore the previous weapon.
  value.sync(snapshot({serial:1,shotCount:1,at:serverAt+80,lastShot:serverAt,recoilPitch:.4*radians}),1201);
  close(value.sample({now:1201}).pitch,0);
});

test('weapon reset also preserves an already covered receipt and starts the next shot from zero',()=>{
  const value=presenter(),oldId=value.predictShot({at:1000});
  value.sync(snapshot({serial:1,shotCount:1,lastShot:serverAt,recoilPitch:.4*radians}),1010);
  value.resetWeapon(1020);
  const newId=value.predictShot({at:1030});assert.notEqual(newId,oldId);
  assert.deepEqual(value.acknowledge({epoch,serial:1},1040),{first:true,predicted:true,predictionId:oldId});
  close(value.sample({now:1040}).pitch,.4*radians);assert.equal(value.sample({now:1040}).pending,1);
  value.sync(snapshot({serial:2,shotCount:1,at:serverAt+40,lastShot:serverAt+30,recoilPitch:.4*radians}),1040);
  assert.deepEqual(value.acknowledge({epoch,serial:2},1040),{first:true,predicted:true,predictionId:newId});
  close(value.sample({now:1040}).pitch,.4*radians);assert.equal(value.sample({now:1040}).pending,0);
});

test('weapon reset without a prediction suppresses old authoritative recoil until the next serial',()=>{
  const value=presenter();value.sync(snapshot({serial:1,shotCount:1,lastShot:serverAt,recoilPitch:.4*radians,recoilYaw:.01}),1000);
  value.resetWeapon(1020);
  value.sync(snapshot({serial:1,shotCount:1,at:serverAt+30,lastShot:serverAt,recoilPitch:.4*radians,recoilYaw:.01}),1030);
  close(value.sample({now:1030}).pitch,0);close(value.sample({now:1030}).yaw,0);
  value.sync(snapshot({serial:2,shotCount:1,at:serverAt+40,lastShot:serverAt+40,recoilPitch:.4*radians}),1040);
  close(value.sample({now:1040}).pitch,.4*radians);
});

test('full round reset clears receipts retained across a weapon reset',()=>{
  const value=presenter();value.predictShot({at:1000});value.resetWeapon(1010);value.reset('duel/2/0');
  assert.deepEqual(value.acknowledge({epoch,serial:1},1100),{first:false,predicted:false,predictionId:null});
  close(value.sample({now:1100}).pitch,0);
});
