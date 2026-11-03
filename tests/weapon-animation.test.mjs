import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleWeaponAnimation} from '../shared/weapon-animation.mjs';
import * as THREE from 'three';
import {WeaponView,makeVandalModel} from '../client/weapon-view.ts';
import {createVandalRecoilPresenter} from '../shared/recoil-presentation.mjs';

const reload=progress=>sampleWeaponAnimation({time:5000,reloadRemaining:2500*(1-progress),reloadDuration:2.5});
const viewState=(extra={})=>({time:5000,dt:1/60,weaponId:'vandal',ads:false,fireHeld:false,shotAt:0,recoilPitch:0,recoilYaw:0,reloadRemaining:0,reloadDuration:2.5,equipRemaining:0,equipDuration:1,speed:0,strafe:0,grounded:true,crouch:false,reducedMotion:false,visible:true,...extra});
const worldPoint=(view,name)=>view.group.getObjectByName(name).getWorldPosition(new THREE.Vector3());
const contactDistance=(view,a,b)=>worldPoint(view,a).distanceTo(worldPoint(view,b));
function assertSightClear(view,label){
 view.group.updateMatrixWorld(true);
 for(const x of [-.002,0,.002])for(const y of [-.002,0,.002]){
  const ray=new THREE.Raycaster(new THREE.Vector3(x,y,0),new THREE.Vector3(0,0,-1));
  const hits=ray.intersectObject(view.group,true);
  assert.equal(hits.length,0,`${label}: optical ray ${x},${y} blocked by ${hits.map(h=>h.object.name)}`);
 }
}
test('reload removes and replaces the actual magazine before the authoritative gate ends',()=>{
 const idle=sampleWeaponAnimation({time:5000}),out=reload(.37),fetch=reload(.48),seat=reload(.71),bolt=reload(.85),settle=reload(.97);
 assert.ok(out.magazine.y<-.25);assert.equal(out.magazineVisible,true);assert.equal(fetch.magazineVisible,false);
 assert.equal(seat.magazineVisible,true);assert.ok(Math.abs(seat.magazine.y)<1e-9);assert.ok(bolt.bolt>.08);
 assert.equal(settle.phase,'reload-settle');assert.equal(settle.reload,.97);assert.equal(idle.phase,'idle');assert.equal(idle.magazineVisible,true);
});
test('every reload hand, magazine and root phase boundary is continuous',()=>{
 const boundaries=[0,.02,.10,.16,.20,.21,.24,.40,.54,.55,.56,.57,.68,.70,.73,.75,.80,.83,.87,.90,1],epsilon=1e-7;
 for(const boundary of boundaries){
  const before=reload(Math.max(0,boundary-epsilon)),after=reload(Math.min(1,boundary+epsilon));
  for(const key of ['position','rotation','support','supportRotation','magazine','magazineRotation']){
   const distance=Math.hypot(...['x','y','z'].map(axis=>before[key][axis]-after[key][axis]));
   assert.ok(distance<1e-5,`${key} jumped ${distance} at ${boundary}`);
  }
 }
});
test('the rotating real magazine and support glove stay in contact during removal and seating',()=>{
 const view=new WeaponView();
 try{for(const progress of [.21,.30,.39,.40,.54,.56,.60,.69,.70]){
  view.update(viewState({reloadRemaining:2500*(1-progress)}));view.group.updateMatrixWorld(true);
  assert.ok(contactDistance(view,'magazine-grip-contact','hand-magazine-contact')<1e-10,`grip lost at ${progress}`);
 }}finally{view.dispose();}
});
test('the support glove follows the actual right-side bolt through its pull',()=>{
 const view=new WeaponView();
 try{for(const progress of [.80,.81,.83,.85,.87,.89,.90]){
  view.update(viewState({reloadRemaining:2500*(1-progress)}));view.group.updateMatrixWorld(true);
  assert.ok(contactDistance(view,'bolt-grip-contact','hand-bolt-contact')<1e-10,`bolt grip lost at ${progress}`);
 }}finally{view.dispose();}
});
test('inspect keeps the support glove attached to its handguard contact throughout the turn',()=>{
 const view=new WeaponView();view.inspect(1000);
 try{for(const elapsed of [0,50,225,450,1000,1950,2350,2649]){
  view.update(viewState({time:1000+elapsed}));view.group.updateMatrixWorld(true);
  assert.ok(contactDistance(view,'support-grip-contact','hand-support-contact')<1e-10,`handguard grip lost at ${elapsed}ms`);
 }}finally{view.dispose();}
});
test('the slim receiver and open sight preserve the world scale and still-ADS optical opening',()=>{
 const view=new WeaponView();
 try{
  view.update(viewState({ads:true}));assertSightClear(view,'still ADS');
  const receiver=new THREE.Box3().setFromObject(view.rig.group.getObjectByName('receiver')),size=receiver.getSize(new THREE.Vector3());
  assert.ok(size.x<.08&&size.y<.15,`oversized first-person receiver ${size.toArray()}`);
  assert.ok(view.rig.group.getObjectByName('front-sight-loop'));assert.equal(view.rig.group.getObjectByName('front-sight-ears'),undefined);
  assert.equal(view.group.scale.x,.74);const world=makeVandalModel();assert.equal(world.group.scale.x,1);
 }finally{view.dispose();}
});
test('real ADS geometry stays clear during first-shot and three-shot recoil pulses and recovery',()=>{
 const epoch='optical-test',serverAt=1_800_000_000_000,presenter=createVandalRecoilPresenter(),view=new WeaponView();
 presenter.sync({epoch,serial:0,at:serverAt,lastShot:serverAt-1000,shotCount:0,recoilPitch:0,recoilYaw:0},1000);
 try{for(const shotAt of [1000,1130,1260]){
  presenter.predictShot({at:shotAt,aim:true});
  for(const elapsed of [0,8,16,32,80,115,125]){
   const recoil=presenter.sample({now:shotAt+elapsed,ads:true});
   view.update(viewState({time:shotAt+elapsed,ads:true,fireHeld:true,shotAt,recoilPitch:recoil.pitch,recoilYaw:recoil.yaw}));
   assertSightClear(view,`shot ${shotAt}, +${elapsed}ms`);
   if(elapsed===16)assert.ok(Math.abs(view.group.rotation.x)>.01,'cosmetic kick was removed');
  }
 }
 for(const elapsed of [150,200,250,375,500]){
  const recoil=presenter.sample({now:1260+elapsed,ads:true});
  view.update(viewState({time:1260+elapsed,ads:true,shotAt:1260,recoilPitch:recoil.pitch,recoilYaw:recoil.yaw}));assertSightClear(view,`recovery +${elapsed}ms`);
 }}finally{view.dispose();}
});
test('ADS opening stays clear across bounded spray, movement bob, strafe and mouse sway',()=>{
 const view=new WeaponView();
 try{for(const recoilPitch of [0,.05,.2,.4])for(const recoilYaw of [-.2,0,.2])for(const elapsed of [0,8,16,32,80,120])for(const direction of [-1,1]){
  view.update(viewState({time:1000+elapsed,ads:true,shotAt:1000,recoilPitch,recoilYaw,speed:5.4,stride:elapsed*.1,strafe:direction,lookPitchDelta:.05*direction,lookYawDelta:.05*direction}));
  assertSightClear(view,`pitch ${recoilPitch}, yaw ${recoilYaw}, +${elapsed}ms, direction ${direction}`);
 }}finally{view.dispose();}
});
test('equip remains cosmetic and follows the authoritative remaining time without its own firing gate',()=>{
 const beginning=sampleWeaponAnimation({time:100,equipRemaining:1000,equipDuration:1});
 const end=sampleWeaponAnimation({time:1000,equipRemaining:0,equipDuration:1});
 assert.equal(beginning.phase,'equip');assert.ok(beginning.position.y<end.position.y-.3);assert.equal(end.phase,'idle');
});
test('inspect yields immediately to ADS, firing, reload or equip',()=>{
 const base={time:2000,inspectAt:1000};assert.equal(sampleWeaponAnimation(base).phase,'inspect');
 for(const action of [{ads:true},{fireHeld:true},{reloadRemaining:1000},{equipRemaining:200}])assert.notEqual(sampleWeaponAnimation({...base,...action}).phase,'inspect');
});
test('reduced motion removes stride, look sway and muzzle flashing while preserving reload semantics',()=>{
 const base={time:1010,shotAt:1000,speed:5.4,grounded:true,reducedMotion:true};
 assert.deepEqual(sampleWeaponAnimation({...base,stride:1,lookYawDelta:10}),sampleWeaponAnimation({...base,stride:9,lookYawDelta:-10}));
 assert.equal(sampleWeaponAnimation(base).flash,false);assert.equal(sampleWeaponAnimation({...base,reloadRemaining:1300}).phase,'reload-fetch');
});
test('invalid cosmetic telemetry cannot create nonfinite weapon transforms',()=>{
 const pose=sampleWeaponAnimation({time:NaN,shotAt:NaN,speed:NaN,stride:Infinity,lookYawDelta:Infinity,lookPitchDelta:NaN,recoilPitch:NaN,recoilYaw:Infinity,reloadDuration:0,equipDuration:NaN});
 for(const key of ['position','rotation','support','supportRotation','magazine','magazineRotation'])assert.ok(Object.values(pose[key]).every(Number.isFinite),key);
});
