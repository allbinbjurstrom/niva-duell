import test from 'node:test';
import assert from 'node:assert/strict';
import {ShooterEngine} from '../server/engine.mjs';

function solo(){
  let now=10_000;
  const catalog={sections:[],choose(){throw Error('Solo must not load original questions');}};
  const engine=new ShooterEngine(catalog,{now:()=>now,random:()=>.5});
  const credential=engine.createTest(),player=engine.connect(credential.token),party=engine.partyOf(player);
  return {engine,credential,player,party,target:engine.active(party).find(p=>p.bot),advance(ms){now+=ms;engine.tick();}};
}
function answerPass(s,correct=true){
  for(const q of s.party.questions){s.engine.command(s.player,{type:'answer',questionId:q.id,answer:correct?'C':'A'});s.engine.command(s.player,{type:'next'});}
}

test('solo starts with one human, three explicit placeholder choices and no original-source access',()=>{
  const s=solo(),state=s.engine.snapshot(s.player);
  assert.equal(state.party.testMode,true);assert.equal(state.party.phase,'training');
  assert.equal(state.party.members.filter(p=>!p.bot).length,1);
  assert.equal(state.self.question.prompt,'Vilket alternativ är rätt?');
  assert.deepEqual(state.self.question.options,['A','B','C']);
  assert.deepEqual(Object.values(state.self.question.optionLabels),['Fel alternativ','Fel alternativ','Rätt alternativ']);
  assert.equal(state.self.question.sourceUrl,'');assert.equal(state.self.question.testMode,true);
  assert.equal(s.engine.authenticate(s.target.token),undefined);
  assert.throws(()=>s.engine.join(s.credential.code,'En vän'),/solotest/);
  assert.throws(()=>s.engine.command(s.player,{type:'subject',section:'ORD'}),/testfrågor/);
});

test('placeholder answers use the ordinary economy and cannot issue duplicate rewards',()=>{
  const s=solo(),id=s.party.questions[0].id;
  s.engine.command(s.player,{type:'answer',questionId:id,answer:'A'});
  s.engine.command(s.player,{type:'answer',questionId:id,answer:'C'});
  assert.equal(s.player.budget,800);assert.equal(s.player.answers.length,1);
  s.engine.command(s.player,{type:'next'});
  for(const q of s.party.questions.slice(1)){s.engine.command(s.player,{type:'answer',questionId:q.id,answer:'C'});s.engine.command(s.player,{type:'next'});}
  assert.equal(s.player.budget,4400);assert.equal(s.party.phase,'matches');assert.equal(s.party.duels[0].phase,'buy');
  const wrong=solo();answerPass(wrong,false);assert.equal(wrong.player.budget,800);
});

test('one player can buy and start; the stationary target never fires and test timers do not expire',()=>{
  const s=solo();answerPass(s);assert.equal(s.player.budget,5300);assert.equal(s.target.ready,true);
  s.advance(90_000);assert.equal(s.party.duels[0].phase,'buy');
  s.engine.command(s.player,{type:'buy',weapon:'vandal',armor:'heavy'});
  assert.equal(s.player.credits,1400);s.engine.command(s.player,{type:'ready'});
  assert.equal(s.party.duels[0].phase,'countdown');s.advance(3100);
  const position={x:s.target.body.x,z:s.target.body.z};s.advance(100_000);
  assert.equal(s.party.duels[0].phase,'live');assert.equal(s.player.body.health,100);
  assert.equal(s.engine.gun(s.target).ammo,12);assert.deepEqual({x:s.target.body.x,z:s.target.body.z},position);
});

test('a solo target can be eliminated, respawns, and a new test pass gets fresh question IDs',()=>{
  const s=solo(),oldIds=s.party.questions.map(q=>q.id);answerPass(s);
  s.engine.command(s.player,{type:'buy',weapon:'vandal'});s.engine.command(s.player,{type:'ready'});s.advance(3100);
  for(let round=0;round<3;round++){
    s.engine.command(s.player,{type:'input',seq:s.player.input.seq+1,yaw:-Math.PI/2,fire:true});s.advance(17);
    assert.equal(s.target.body.health,0);assert.equal(s.party.duels[0].score[s.player.id],round+1);
    if(round<2){s.advance(4100);assert.equal(s.target.body.health,100);assert.equal(s.engine.gun(s.player).ammo,25);s.advance(3100);}
  }
  s.advance(8100);assert.equal(s.party.phase,'finished');
  s.engine.command(s.player,{type:'start'});assert.equal(s.party.phase,'training');assert.equal(s.player.budget,800);
  assert.ok(s.party.questions.every(q=>!oldIds.includes(q.id)));assert.equal(s.party.used.size,0);
});

test('leaving or exceeding reconnect grace removes the solo target and invalidates the session',()=>{
  for(const disconnected of [false,true]){
    const s=solo();answerPass(s);s.engine.command(s.player,{type:'ready'});s.advance(3100);
    if(disconnected){s.engine.disconnect(s.player.id);s.advance(31_000);}else s.engine.command(s.player,{type:'leave'});
    assert.equal(s.engine.parties.size,0);assert.equal(s.engine.players.size,0);
    assert.equal(s.engine.authenticate(s.credential.token),undefined);
  }
});
