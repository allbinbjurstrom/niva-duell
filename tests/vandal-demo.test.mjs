import test from 'node:test';
import assert from 'node:assert/strict';
import {ShooterEngine} from '../server/engine.mjs';
import {RULES,WEAPONS,wallDistance} from '../shared/rules.mjs';

function demo(){
 let now=10000,seq=0;const engine=new ShooterEngine({sections:[],choose(){throw new Error('Originalbank ska inte användas');}},{now:()=>now,random:()=>.5});
 const credential=engine.createDemo(),p=engine.connect(credential.token),party=engine.partyOf(p),duel=engine.duelOf(p),target=engine.players.get(duel.players.find(id=>id!==p.id));
 const step=(input={},ticks=1)=>{for(let i=0;i<ticks;i++){now+=1000/128;engine.command(p,{type:'input',seq:++seq,epoch:p.motion.epoch,yaw:-Math.PI/2,...input});engine.tick();}};
 return {engine,credential,p,party,duel,target,step};
}
test('Vandal demo enters the arena directly with real magazine, full armor and no fabricated answers',()=>{
 const s=demo(),state=s.engine.snapshot(s.p);assert.equal(state.party.demoMode,'vandal');assert.equal(state.duel.phase,'live');assert.equal(state.self.activeWeapon,'vandal');assert.equal(state.self.ammo,25);assert.equal(state.self.reserve,50);assert.equal(state.self.body.shield,50);assert.equal(s.target.body.shield,50);assert.equal(state.self.correct,0);assert.equal(s.p.answers.length,0);assert.equal(s.party.questions.length,0);assert.equal(s.party.used.size,0);
 assert.throws(()=>s.engine.join(s.credential.code,'En vän'),/solotest/);
});
test('a Vandal headshot eliminates the armored demo target once and emits authoritative kill feedback',()=>{
 const s=demo();s.step({},128);s.step({fire:true,firePress:1});assert.equal(s.target.body.health,0);assert.equal(s.p.stats.kills,1);assert.equal(s.duel.score[s.p.id],1);assert.equal(s.duel.phase,'live');assert.equal(s.duel.events.filter(e=>e.killed).length,1);assert.equal(s.p.inventory.primary.ammo,24);
 s.step({},30);assert.equal(s.duel.score[s.p.id],1);
});
test('demo target respawns without resetting the shooter position, recoil history or ammunition',()=>{
 const s=demo();s.step({},128);s.step({fire:true,firePress:1});const ammo=s.p.inventory.primary.ammo;s.step({strafe:1},90);const x=s.p.body.x,z=s.p.body.z;s.step({},40);assert.equal(s.target.body.health,100);assert.equal(s.target.body.shield,50);assert.equal(s.p.inventory.primary.ammo,ammo);assert.equal(s.p.body.x,x);assert.equal(s.p.body.z,z);assert.equal(s.duel.phase,'live');
});
test('demo reset restores the Vandal loadout and gates draw without affecting ordinary test-mode rules',()=>{
 const s=demo();s.step({},128);s.step({fire:true,firePress:1});const round=s.duel.round;s.engine.command(s.p,{type:'reset-demo'});assert.equal(s.duel.round,round+1);assert.equal(s.p.inventory.primary.ammo,WEAPONS.vandal.mag);assert.equal(s.target.body.health,100);assert.equal(s.p.stats.kills,0);assert.equal(s.duel.score[s.p.id],0);assert.ok(s.p.equipUntil>0);
 const ordinary=s.engine.createTest(),p=s.engine.connect(ordinary.token);assert.equal(s.engine.partyOf(p).phase,'training');assert.equal(s.engine.partyOf(p).questions.length,RULES.questions);
});
test('world bullets stop on the visible floor rather than passing below the arena',()=>{assert.equal(wallDistance([0,1.6,-9],[0,-1,0]),1.6);});
test('demo movement is opt-in, bounded and never fires back',()=>{
 const s=demo();s.step({},64);assert.equal(s.target.body.z,-9);assert.equal(s.engine.snapshot(s.p).party.demoTargetMoving,false);
 s.engine.command(s.p,{type:'demo-target',moving:true});const positions=[];for(let i=0;i<400;i++){s.step();positions.push(s.target.body.z);}
 assert.ok(Math.min(...positions)<-10.7);assert.ok(Math.max(...positions)>-7.3);assert.ok(Math.min(...positions)>-10.86);assert.ok(Math.max(...positions)<-7.14);assert.ok(Math.abs(s.target.body.x-4)<1e-8);assert.equal(s.p.body.health,100);assert.equal(s.duel.events.length,0);assert.equal(s.target.inventory.primary.ammo,25);
 s.engine.command(s.p,{type:'demo-target',moving:false});s.step();const stopped=s.target.body.z;s.step({},64);assert.equal(s.target.body.z,stopped);
 const other=s.engine.createTest(),ordinary=s.engine.connect(other.token);assert.throws(()=>s.engine.command(ordinary,{type:'demo-target',moving:true}));
});
test('accepted volleys carry a monotonic serial independent of recoil recovery, reset at spawn',()=>{
 const s=demo();s.step({},128);s.step({fire:true,firePress:1});assert.equal(s.engine.snapshot(s.p).self.shotSerial,1);assert.equal(s.duel.events.at(-1).shotSerial,1);
 s.step({},64);assert.equal(s.p.shotCount,0);assert.equal(s.p.shotSerial,1);s.step({fire:true,firePress:2});assert.equal(s.duel.events.at(-1).shotSerial,2);s.engine.command(s.p,{type:'reset-demo'});assert.equal(s.p.shotSerial,0);
});
test('the wall drill provides a clean 10 m lane without an active bot or invented kills',()=>{
 const s=demo();s.engine.command(s.p,{type:'demo-drill',drill:'wall'});let snap=s.engine.snapshot(s.p);assert.equal(snap.party.demoDrill,'wall');assert.equal(s.p.body.x,14);assert.equal(s.p.body.z,0);assert.equal(s.target.body.health,0);assert.equal(s.p.inventory.primary.ammo,25);
 s.step({},128);s.step({fire:true,firePress:1});const shot=s.duel.events.at(-1);assert.equal(shot.targetId,null);assert.ok(Math.abs(shot.end[0]-24)<1e-6);s.step({},200);assert.equal(s.target.body.health,0);assert.equal(s.duel.targetRespawnAt,0);assert.equal(s.p.stats.kills,0);assert.equal(s.duel.score[s.p.id],0);assert.throws(()=>s.engine.command(s.p,{type:'demo-target',moving:true}));
 s.engine.command(s.p,{type:'demo-drill',drill:'target'});snap=s.engine.snapshot(s.p);assert.equal(snap.party.demoDrill,'target');assert.equal(s.p.body.x,-4);assert.equal(s.p.body.z,-9);assert.equal(s.target.body.health,100);assert.equal(s.target.body.shield,50);assert.equal(s.p.inventory.primary.ammo,25);
 assert.throws(()=>s.engine.command(s.p,{type:'demo-drill',drill:'unknown'}));
});
