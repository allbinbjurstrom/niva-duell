import test from 'node:test';
import assert from 'node:assert/strict';
import {RULES,WEAPONS,makeBody,moveBody,inputState} from '../shared/rules.mjs';
import {normalizeControls,DEFAULT_CONTROLS,radiansPerCount,cmPerTurn,verticalFov,lookScale,reconcileBody} from '../shared/controls.mjs';
import {fireProfile,shotSpread,advanceRecoil} from '../shared/gunplay.mjs';
import {ShooterEngine} from '../server/engine.mjs';

const close=(a,b,epsilon=1e-9)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const body=()=>makeBody({x:-4,z:-9,yaw:-Math.PI/2});
const controls=values=>inputState({yaw:-Math.PI/2,...values});
const step=(b,input,w=WEAPONS.vandal)=>moveBody(b,input,1/RULES.tickRate,w);
function live(weapon='vandal'){
  let now=10_000;const engine=new ShooterEngine({sections:[]},{now:()=>now,random:()=>.5});
  const credential=engine.createTest(),player=engine.connect(credential.token),party=engine.partyOf(player);
  for(const q of party.questions){engine.command(player,{type:'answer',questionId:q.id,answer:'C'});engine.command(player,{type:'next'});}
  engine.command(player,{type:'buy',weapon});engine.command(player,{type:'ready'});now+=3100;engine.tick();
  return {engine,player,party,target:engine.active(party).find(p=>p.bot),duel:party.duels[0],input(value){engine.command(player,{type:'input',seq:player.input.seq+1,yaw:0,...value});},tick(ms=1000/RULES.tickRate){now+=ms;engine.tick();},wait(ms){now+=ms;}};
}

test('ground movement starts, stops and reverses in one step with no residual displacement',()=>{
  const b=body();step(b,controls({forward:1}));close(b.vx,5.4);close(b.x,-4+5.4/128);
  const x=b.x;step(b,controls({}));close(b.vx,0);close(b.x,x);
  step(b,controls({forward:-1}));close(b.vx,-5.4);assert.ok(b.x<x);
});
test('diagonals do not boost speed; walk, crouch, ADS, tagging and knife have distinct speeds',()=>{
  const b=body();step(b,controls({forward:1,strafe:1}));close(Math.hypot(b.vx,b.vz),5.4);
  step(b,controls({forward:1,walk:true}));close(b.vx,3.24);
  step(b,controls({forward:1,crouch:true}));close(b.vx,5.4*.325);
  step(b,controls({forward:1,aim:true}));close(b.vx,5.4*.76);
  b.tagged=true;step(b,controls({forward:1}));close(b.vx,5.4*.275);
  b.tagged=false;step(b,controls({forward:1}),WEAPONS.knife);close(b.vx,6.75);
});
test('holding jump does not automatically jump again and landing gives a binary accuracy penalty',()=>{
  const b=body();step(b,controls({jump:true}));assert.ok(b.y>0);let landed=false;
  for(let i=0;i<128;i++){step(b,controls({jump:true}));if(b.grounded){close(b.landPenalty,.225);landed=true;break;}}
  assert.ok(landed);for(let i=0;i<80;i++)step(b,controls({jump:true}));close(b.y,0);close(b.landPenalty,0);
  step(b,controls({jump:false}));step(b,controls({jump:true}));assert.ok(b.y>0);
});
test('a player can land on low cover, stay on top, and fall when walking off',()=>{
  const b=makeBody({x:-9,z:7,yaw:0});b.y=2;b.grounded=false;
  for(let i=0;i<80;i++)step(b,inputState({}));close(b.y,1.15);assert.equal(b.grounded,true);
  for(let i=0;i<128;i++)step(b,inputState({forward:1}));assert.ok(b.z<5.5);assert.ok(b.y<1.15);
});
test('acknowledged-frame replay exactly preserves local start, stop and reversal without interpolation',()=>{
  const b=body(),authoritative=body(),pending=[];
  for(let seq=1;seq<=20;seq++){
    const input=controls({seq,forward:seq<10?1:seq<15?0:-1});step(b,input);pending.push({input});
    if(seq<=8)step(authoritative,input);
  }
  const result=reconcileBody(authoritative,pending,WEAPONS.vandal);close(result.body.x,b.x);close(result.body.vx,b.vx);assert.equal(result.body.seq,20);assert.equal(result.pending.length,12);
  const final=reconcileBody(b,result.pending,WEAPONS.vandal);assert.equal(final.pending.length,0);close(final.body.x,b.x);
});
test('device settings reject corrupt values; DPI is informational and angle scales are reproducible',()=>{
  assert.deepEqual(normalizeControls({dpi:Infinity,sensitivity:0,adsSensitivity:100,aimMode:'bad',sound:'false'}),DEFAULT_CONTROLS);
  const a=normalizeControls({dpi:800,sensitivity:.35}),b=normalizeControls({dpi:1600,sensitivity:.35});
  close(lookScale(a,WEAPONS.vandal,inputState({})),lookScale(b,WEAPONS.vandal,inputState({})));
  close(radiansPerCount(1),.07*Math.PI/180);assert.ok(cmPerTurn(800,.35)>46&&cmPerTurn(800,.35)<47);
  close(lookScale(a,WEAPONS.vandal,inputState({aim:true})),radiansPerCount(.35)/1.25);
  close(lookScale(a,WEAPONS.operator,inputState({aim:true,zoomLevel:2})),radiansPerCount(.35)/5);
  const fov=verticalFov(16/9),zoomed=verticalFov(16/9,2.5);close(Math.tan(fov*Math.PI/360)/Math.tan(zoomed*Math.PI/360),2.5);assert.ok(fov>70&&fov<71);
});
test('movement and landing penalties preserve weapon roles, including the Operator deadzone',()=>{
  const b=body(),still=shotSpread(WEAPONS.vandal,b,controls({}),0);
  step(b,controls({forward:1,walk:true}));assert.ok(shotSpread(WEAPONS.vandal,b,controls({walk:true}),0)>still);
  assert.ok(shotSpread(WEAPONS.vandal,b,controls({walk:true}),0)>shotSpread(WEAPONS.spectre,b,controls({walk:true}),0));
  b.vx=WEAPONS.vandal.runSpeed*.2;b.vz=0;close(shotSpread(WEAPONS.vandal,b,controls({}),0),still);
  assert.ok(shotSpread(WEAPONS.operator,b,controls({aim:true}),0)>0);
  b.vx=0;b.landPenalty=.225;assert.ok(shotSpread(WEAPONS.vandal,b,controls({}),0)>still+.1);b.landPenalty=0;close(shotSpread(WEAPONS.vandal,b,controls({}),0),still);
});
test('ADS reduces automatic-rifle fire rate but leaves Guardian and Operator rates intact',()=>{
  const input=inputState({aim:true});close(fireProfile(WEAPONS.vandal,input).rate,8.775);close(fireProfile(WEAPONS.phantom,input).rate,9.9);
  close(fireProfile(WEAPONS.guardian,input).rate,5.25);close(fireProfile(WEAPONS.operator,input).rate,.6);
  assert.equal(WEAPONS.ghost.mag,13);assert.equal(WEAPONS.phantom.range,20);assert.deepEqual(WEAPONS.phantom.farDamage,[140,35,29]);
});
test('rifle recoil respects protected shot counts and cannot switch sides before the switch interval',()=>{
  for(const [weapon,protectedShots] of [[WEAPONS.vandal,6],[WEAPONS.phantom,8]]){
    const p={shotCount:0,recoilPitch:0,recoilYaw:0,recoilSide:0,yawSwitchAt:0};
    for(let i=0;i<protectedShots;i++){advanceRecoil(p,weapon,1000,()=>0);assert.equal(p.recoilSide,-1);}assert.notEqual(p.recoilYaw,0);
    advanceRecoil(p,weapon,1200,()=>0);assert.equal(p.recoilSide,-1);advanceRecoil(p,weapon,1600,()=>0);assert.equal(p.recoilSide,1);
  }
});
test('Classic alternate fire consumes three rounds, emits one volley and cannot fire again while held',()=>{
  const s=live('classic');s.input({altFire:true,altPress:1});s.tick();assert.equal(s.engine.gun(s.player).ammo,9);
  assert.equal(s.duel.events.length,3);assert.equal(new Set(s.duel.events.map(e=>e.volleyId)).size,1);
  for(let i=0;i<80;i++){s.input({altFire:true,altPress:1});s.tick();}assert.equal(s.engine.gun(s.player).ammo,9);
  s.input({altFire:false,altPress:1});s.tick();s.input({altFire:true,altPress:2});s.tick();assert.equal(s.engine.gun(s.player).ammo,6);
});
test('short clicks between simulation frames are latched, and a three-pellet elimination counts only once',()=>{
  const s=live('classic');s.target.body.x=-1; // Close-range burst: isolate click latching/kill counting from random spread.
 s.input({yaw:-Math.PI/2,altFire:false,altPress:1});s.tick();assert.equal(s.target.body.health,0);assert.equal(s.player.stats.kills,1);assert.equal(s.target.stats.deaths,1);assert.equal(s.engine.gun(s.player).ammo,9);
});
test('weapon slots, equip gates, same-slot reload and individual cooldowns remain authoritative',()=>{
  const s=live();s.engine.command(s.player,{type:'switch',slot:2});assert.equal(s.engine.gun(s.player).id,'classic');
  assert.deepEqual(s.engine.shoot(s.player,s.target,s.duel),[]);assert.equal(s.engine.gun(s.player).ammo,12);
  s.wait(751);s.engine.shoot(s.player,s.target,s.duel);assert.equal(s.engine.gun(s.player).ammo,11);
  s.engine.command(s.player,{type:'reload'});const end=s.engine.gun(s.player).reloadAt;s.engine.command(s.player,{type:'switch',slot:2});assert.equal(s.engine.gun(s.player).reloadAt,end);
  s.engine.command(s.player,{type:'switch',slot:3});assert.equal(s.engine.gun(s.player).id,'knife');assert.equal(s.player.inventory.sidearm.reloadAt,0);
  const pistol=live('ghost');assert.equal(pistol.player.slot,2);assert.equal(pistol.player.inventory.primary,null);assert.equal(pistol.engine.gun(pistol.player).id,'ghost');
});
test('knife has a short reach, no ammo cost and separate front/back damage',()=>{
  const s=live();s.engine.command(s.player,{type:'switch',slot:3});s.wait(751);s.player.appliedInput=controls({});
  assert.deepEqual(s.engine.shoot(s.player,s.target,s.duel),[]);
  s.target.body.x=-2.4;s.target.body.yaw=Math.PI/2;s.wait(501);const front=s.engine.shoot(s.player,s.target,s.duel,true);assert.equal(front[0].damage,75);
  s.target.body.yaw=-Math.PI/2;s.wait(1001);const back=s.engine.shoot(s.player,s.target,s.duel,true);assert.equal(back[0].damage,150);assert.equal(s.engine.gun(s.player).ammo,0);
});
test('queued commands cannot accelerate server movement and disconnect stops queued movement',()=>{
  const s=live(),x=s.player.body.x;
  for(let i=0;i<100;i++)s.input({forward:1,yaw:-Math.PI/2});assert.equal(s.player.pendingInputs.length,64);
  s.tick();close(s.player.body.x-x,5.4/128);s.engine.disconnect(s.player.id);s.tick();assert.equal(s.player.pendingInputs.length,0);close(s.player.body.vx,0);
});
