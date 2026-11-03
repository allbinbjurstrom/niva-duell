import test from 'node:test';
import assert from 'node:assert/strict';
import {ShooterEngine} from '../server/engine.mjs';
import {RULES,MAP,WEAPONS,budget,scheduleRoundRobin,makeBody,moveBody,inputState,rayBox,wallDistance,hitBody,applyDamage} from '../shared/rules.mjs';
import {loadCatalog} from '../server/catalog.mjs';

// Metadata-only fixtures model original question references; they contain no invented question wording.
export const fixture={sections:[{id:'ORD',name:'Ordförståelse'}],choose:()=>Array.from({length:5},(_,i)=>({id:`source-q${i}`,section:'ORD',number:i+1,pages:[2],paperId:'source',title:'Originalreferens',sourceUrl:'https://www.studera.nu/original.pdf',options:[...'ABCDE'],answer:'C'})),pdf:async()=>Buffer.from('')};
function setup(count=2){
  let now=10_000;const engine=new ShooterEngine(fixture,{now:()=>now,random:()=>.5});
  const credentials=[engine.create('Spelare 1','ORD')];for(let i=1;i<count;i++)credentials.push(engine.join(credentials[0].code,`Spelare ${i+1}`));
  const players=credentials.map(c=>engine.connect(c.token)),party=engine.partyOf(players[0]);
  return {engine,players,party,advance(ms){now+=ms;engine.tick();}};
}
function answerPass(engine,p,correct=5){for(let i=0;i<5;i++){engine.command(p,{type:'answer',questionId:`source-q${i}`,answer:i<correct?'C':'A'});engine.command(p,{type:'next'});}}
function startMatches(s){s.engine.command(s.players[0],{type:'start'});for(const p of s.players)answerPass(s.engine,p);return s.party.duels;}
function input(engine,p,fields){engine.command(p,{type:'input',seq:p.input.seq+1,...fields});}

test('party codes use three letters, stay unique and accept lowercase when joining',()=>{
  const engine=new ShooterEngine(fixture),codes=new Set();
  for(let i=0;i<128;i++){
    const party=engine.create(`Värd ${i}`,'ORD');assert.match(party.code,/^[A-Z]{3}$/);assert.ok(!codes.has(party.code));codes.add(party.code);
  }
  const code=codes.values().next().value;
  assert.equal(engine.join(` ${code.toLowerCase()} `,'Gäst').code,code);
  for(const invalid of ['AB','ABCD','A1B','123',null])assert.throws(()=>engine.join(invalid,'Gäst'),/tre bokstäver/);
});

test('2–12 players meet every opponent once; simultaneous pairs are disjoint and byes rotate',()=>{
  for(let count=2;count<=12;count++){
    const ids=Array.from({length:count},(_,i)=>String(i+1)),waves=scheduleRoundRobin(ids),seen=new Set(),byes=new Map();
    for(const wave of waves){const playing=wave.pairs.flat();assert.equal(new Set(playing).size,playing.length);assert.equal(playing.length,count-count%2);
      for(const pair of wave.pairs){const key=pair.sort().join(':');assert.ok(!seen.has(key));seen.add(key);}
      if(wave.bye)byes.set(wave.bye,(byes.get(wave.bye)??0)+1);
    }
    assert.equal(seen.size,count*(count-1)/2);if(count%2)assert.deepEqual([...byes.values()],ids.map(()=>1));
  }
});
test('original catalog includes all eight Nivå subjects and valid metadata',()=>{
  const c=loadCatalog();assert.equal(c.sections.length,8);
  for(const section of c.sections){const questions=c.choose(section.id,5);assert.equal(new Set(questions.map(q=>q.id)).size,5);assert.ok(questions.every(q=>q.pages.length&&q.options.includes(q.answer)&&q.sourceUrl.startsWith('https://www.studera.nu/')));}
});
test('a host chooses the subject; joining a running party is rejected',()=>{
  const {engine,players,party}=setup();assert.throws(()=>engine.command(players[1],{type:'start'}),/värden/);assert.throws(()=>engine.command(players[0],{type:'subject',section:'OTHER'}));
  engine.command(players[0],{type:'start'});assert.equal(party.phase,'training');assert.throws(()=>engine.join(party.code,'Sen spelare'),/spelar/);
});
test('grading is private, locked to current question and rewards the first answer once',()=>{
  const {engine,players}=setup();engine.command(players[0],{type:'start'});
  let snap=engine.snapshot(players[0]);assert.ok(!Object.hasOwn(snap.self.question,'answer'));assert.equal(snap.self.feedback,null);
  assert.throws(()=>engine.command(players[0],{type:'answer',questionId:'source-q4',answer:'C'}));
  assert.throws(()=>engine.command(players[0],{type:'answer',questionId:'source-q0',answer:'Z'}));
  engine.command(players[0],{type:'answer',questionId:'source-q0',answer:'C'});engine.command(players[0],{type:'answer',questionId:'source-q0',answer:'C'});
  assert.equal(players[0].budget,1700);assert.equal(players[0].answers.length,1);assert.equal(engine.snapshot(players[1]).self.feedback,null);
  engine.command(players[0],{type:'next'});engine.command(players[0],{type:'answer',questionId:'source-q1',answer:'A'});engine.command(players[0],{type:'answer',questionId:'source-q1',answer:'C'});assert.equal(players[0].budget,1700);
  snap=engine.snapshot(players[0]);assert.equal(snap.self.feedback.correct,false);assert.equal(snap.self.feedback.answer,'C');
  assert.ok(!JSON.stringify(engine.snapshot(players[1])).includes(players[0].token));
});
test('everyone finishes training before concurrent duels start, with a fair earned budget',()=>{
  const s=setup(4);s.engine.command(s.players[0],{type:'start'});
  for(let i=0;i<3;i++)answerPass(s.engine,s.players[i],i);assert.equal(s.party.phase,'training');
  answerPass(s.engine,s.players[3],5);assert.equal(s.party.phase,'matches');assert.equal(s.party.duels.length,2);
  assert.deepEqual(s.players.map(p=>p.budget),[800,1700,2600,5300]);
});
test('purchases are validated and changing loadout refunds the previous selection',()=>{
  const s=setup();startMatches(s);const p=s.players[0];
  s.engine.command(p,{type:'buy',weapon:'vandal',armor:'heavy'});assert.equal(p.credits,1400);
  assert.throws(()=>s.engine.command(p,{type:'buy',weapon:'operator'}),/räcker/);
  assert.equal(p.weapon,'vandal');assert.equal(p.credits,1400);
  s.engine.command(p,{type:'buy',armor:'none'});s.engine.command(p,{type:'buy',weapon:'operator'});assert.equal(p.credits,600);
  s.engine.command(p,{type:'buy',weapon:'classic'});assert.equal(p.credits,5300);assert.throws(()=>s.engine.command(p,{type:'buy',weapon:'__proto__'}));
  for(const player of s.players)s.engine.command(player,{type:'ready'});assert.equal(s.party.duels[0].phase,'countdown');
  assert.throws(()=>s.engine.command(p,{type:'buy',weapon:'vandal'}),/Köptiden/);
});
test('server owns movement, collision, round gating and stale-input timeout',()=>{
  const s=setup();startMatches(s);const p=s.players[0],x=p.body.x;
  input(s.engine,p,{forward:1,yaw:-Math.PI/2});s.advance(100);assert.equal(p.body.x,x);
  for(const player of s.players)s.engine.command(player,{type:'ready'});s.advance(3100);assert.equal(s.party.duels[0].phase,'live');
  input(s.engine,p,{forward:1,yaw:-Math.PI/2});for(let i=0;i<12;i++)s.advance(16);assert.ok(p.body.x>x);const moved=p.body.x;
  s.advance(400);assert.ok(p.body.x-moved<.1);
  const body=makeBody({x:-3.5,z:0,yaw:-Math.PI/2});for(let i=0;i<120;i++)moveBody(body,inputState({forward:1,yaw:-Math.PI/2}),1/60,WEAPONS.vandal);assert.ok(body.x<=-3-RULES.radius);
  const malformed=inputState({forward:Infinity,pitch:NaN,yaw:'hack',fire:1});assert.equal(malformed.forward,0);assert.equal(malformed.pitch,0);assert.equal(malformed.fire,false);
});
test('ray intersections respect cover, head/body zones and armor absorption',()=>{
  const origin=[-5,1.62,0],direction=[1,0,0];assert.equal(rayBox(origin,direction,[-3,0,-3],[3,5,3]),2);assert.equal(wallDistance(origin,direction),2);
  const target=makeBody({x:5,z:0,yaw:0});assert.equal(hitBody(origin,direction,target).zone,0);assert.ok(hitBody(origin,direction,target).distance>wallDistance(origin,direction));
  target.shield=50;assert.equal(applyDamage(target,40),false);assert.ok(Math.abs(target.health-86.6666667)<.001);assert.ok(Math.abs(target.shield-23.3333333)<.001);assert.equal(applyDamage(target,160),true);
});
test('three won rounds end a duel; health, armor and ammunition reset between rounds',()=>{
  const s=setup(),[a,b]=s.players;startMatches(s);s.engine.command(a,{type:'buy',weapon:'vandal',armor:'heavy'});s.engine.command(b,{type:'buy',armor:'heavy'});
  for(const p of s.players)s.engine.command(p,{type:'ready'});s.advance(3100);const duel=s.party.duels[0];
  for(let round=0;round<3;round++){
    a.body.x=-4;a.body.z=-9;b.body.x=4;b.body.z=-9;
    input(s.engine,a,{yaw:-Math.PI/2,pitch:0,fire:true});s.advance(17);
    assert.equal(b.body.health,0);assert.equal(duel.score[a.id],round+1);
    if(round<2){assert.equal(duel.phase,'result');s.advance(4100);assert.equal(b.body.health,100);assert.equal(b.body.shield,50);assert.equal(s.engine.gun(a).ammo,25);s.advance(3100);}
  }
  assert.equal(duel.phase,'finished');assert.equal(duel.winnerId,a.id);assert.equal(a.stats.wins,1);assert.equal(a.stats.kills,3);
  s.advance(8100);assert.equal(s.party.phase,'finished');
});
test('a wall prevents damage and fire-rate/ammunition checks run on the server',()=>{
  const s=setup(),[a,b]=s.players;startMatches(s);s.engine.command(a,{type:'buy',weapon:'vandal'});for(const p of s.players)s.engine.command(p,{type:'ready'});s.advance(3100);
  a.body.x=-5;a.body.z=0;b.body.x=5;b.body.z=0;input(s.engine,a,{yaw:-Math.PI/2,fire:true});s.advance(17);assert.equal(b.body.health,100);assert.equal(s.engine.gun(a).ammo,24);
  s.advance(17);assert.equal(s.engine.gun(a).ammo,24);s.advance(110);assert.equal(s.engine.gun(a).ammo,23);
});
test('reloads consume reserve and switching weapons cancels a pending reload',()=>{
  const s=setup(),[p]=s.players;startMatches(s);s.engine.command(p,{type:'buy',weapon:'vandal'});for(const p of s.players)s.engine.command(p,{type:'ready'});s.advance(3100);
  const gun=s.engine.gun(p);gun.ammo=3;s.engine.command(p,{type:'reload'});assert.ok(gun.reloadAt);s.engine.command(p,{type:'switch',slot:2});assert.equal(gun.reloadAt,0);assert.equal(s.engine.gun(p).id,'classic');
  s.engine.command(p,{type:'switch',slot:1});s.engine.command(p,{type:'reload'});s.advance(2600);assert.equal(gun.ammo,25);assert.equal(gun.reserve,28);
});
test('disconnect grace permits rejoining and eventually awards a forfeit without blocking the party',()=>{
  const s=setup(3);startMatches(s);const duel=s.party.duels[0],loser=s.engine.players.get(duel.players[0]),winner=s.engine.players.get(duel.players[1]);
  s.engine.disconnect(loser.id);s.advance(15_000);s.engine.connect(loser.token);assert.ok(!loser.withdrawn);
  s.engine.disconnect(loser.id);s.advance(30_001);assert.ok(loser.withdrawn);assert.equal(duel.phase,'finished');assert.equal(duel.winnerId,winner.id);assert.equal(s.engine.authenticate(loser.token),undefined);
});
test('host leaves training: ownership transfers and remaining players can finish',()=>{
  const s=setup(3);s.engine.command(s.players[0],{type:'start'});s.engine.command(s.players[0],{type:'leave'});assert.equal(s.party.hostId,s.players[1].id);
  answerPass(s.engine,s.players[1]);answerPass(s.engine,s.players[2]);assert.equal(s.party.duels.length,1);assert.equal(s.party.phase,'matches');
});
