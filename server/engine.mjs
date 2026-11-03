import {randomBytes,randomInt,randomUUID} from 'node:crypto';
import {RULES,WEAPONS,ARMOR,MAP,budget,scheduleRoundRobin,inputState,makeBody,moveBody,wallDistance,hitBody,applyDamage,clamp} from '../shared/rules.mjs';
import {DEMO_WALL} from '../shared/training-layout.mjs';
import {testQuestions,TEST_SPAWNS} from './test-mode.mjs';
import {fireProfile,shotSpread,advanceRecoil,shotDeadline} from '../shared/gunplay.mjs';
import {rememberPose,validatedViewPose} from '../shared/presentation.mjs';
import {MovementTimeline} from './movement.mjs';
import {meleeStrike} from '../shared/melee.mjs';
import {recoverVandalRecoil} from '../shared/vandal-profile.mjs';

const cleanName=value=>typeof value==='string'?value.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,24):'';
const requireValue=(condition,message)=>{if(!condition)throw new Error(message);};
export class ShooterEngine {
  constructor(catalog,{now=()=>Date.now(),random=Math.random}={}){
    this.catalog=catalog;this.now=now;this.random=random;this.parties=new Map();this.players=new Map();this.tokens=new Map();this.eventId=0;this.volleyId=0;this.tickCount=0;
  }
  addPlayer(party,name){
    name=cleanName(name);requireValue(name.length>=2,'Skriv ett namn med minst två tecken.');
    const p={id:randomUUID(),token:randomBytes(32).toString('base64url'),partyId:party.code,name,bot:false,connected:false,disconnectedAt:this.now(),withdrawn:false,
      answers:[],questionIndex:0,trainingComplete:false,budget:budget(0),credits:budget(0),weapon:'classic',armor:'none',ready:false,
      stats:{wins:0,rounds:0,kills:0,deaths:0},input:inputState({}),inputAt:0,body:null,inventory:null,recoilPitch:0,recoilYaw:0,lastShot:0,shotCount:0,shotSerial:0,fireHeld:false};
    this.players.set(p.id,p);this.tokens.set(p.token,p.id);party.players.push(p.id);return p;
  }
  create(name,section='ORD',{testMode=false}={}){
    requireValue(this.parties.size<128,'Servern har fullt just nu. Försök igen senare.');
    requireValue(testMode||this.catalog.sections.some(s=>s.id===section),'Välj ett ämne som finns i Nivå.');
    let code;do{code=Array.from({length:3},()=>String.fromCharCode(65+randomInt(26))).join('');}while(this.parties.has(code));
    const party={code,hostId:null,section,testMode,phase:'lobby',players:[],questions:[],used:new Set(),schedule:[],waveIndex:-1,duels:[],waveEndsAt:0,lastActivity:this.now(),notice:''};
    const player=this.addPlayer(party,name);party.hostId=player.id;this.parties.set(code,party);return this.credentials(player,party);
  }
  createTest(name='Testspelare'){
    const credential=this.create(cleanName(name)||'Testspelare','TEST',{testMode:true});
    const party=this.parties.get(credential.code),target=this.addPlayer(party,'Träningsmål');
    target.bot=true;target.connected=true;target.disconnectedAt=0;this.tokens.delete(target.token);
    this.startTraining(party);return credential;
  }
  createDemo(name='Testspelare'){
    const credential=this.createTest(name),party=this.parties.get(credential.code);
    party.demoMode='vandal';party.demoDrill='target';party.demoTargetMoving=false;party.questions=[];
    for(const p of this.active(party)){p.trainingComplete=true;p.budget=budget(RULES.questions);p.credits=p.budget;}
    this.checkTraining(party);
    for(const p of this.active(party)){p.weapon='vandal';p.armor='heavy';p.ready=true;}
    const duel=party.duels[0];this.spawn(duel);duel.phase='live';duel.endsAt=this.now()+RULES.roundSeconds*1000;
    for(const id of duel.players)this.players.get(id).equipUntil=this.now()+WEAPONS.vandal.equip*1000;
    return credential;
  }
  join(code,name){
    const normalized=typeof code==='string'?code.trim().toUpperCase():'';
    requireValue(/^[A-Z]{3}$/.test(normalized),'Partykoden består av tre bokstäver, till exempel ABC.');
    const party=this.parties.get(normalized);requireValue(party,'Det finns inget party med den koden.');
    requireValue(!party.testMode,'Det här är ett solotest. Skapa ett vanligt party för att spela tillsammans.');
    requireValue(party.phase==='lobby'||party.phase==='finished','Partyt spelar just nu. Be värden återvända till lobbyn.');
    requireValue(party.players.length<RULES.maxPlayers,'Partyt är fullt. Upp till tolv kan vara med.');
    const player=this.addPlayer(party,name);party.lastActivity=this.now();return this.credentials(player,party);
  }
  credentials(player,party){return {token:player.token,playerId:player.id,code:party.code};}
  authenticate(token){return this.players.get(this.tokens.get(token));}
  connect(token){const p=this.authenticate(token);requireValue(p&&!p.withdrawn,'Spelarsessionen har gått ut. Anslut till partyt igen.');p.connected=true;p.disconnectedAt=0;this.parties.get(p.partyId).lastActivity=this.now();return p;}
  disconnect(id){const p=this.players.get(id);if(p){p.connected=false;p.disconnectedAt=this.now();p.input=inputState({yaw:p.body?.yaw??0,pitch:p.body?.pitch??0,seq:p.input.seq});p.appliedInput=p.input;p.pendingInputs=[];p.inputAt=0;}}
  partyOf(p){const party=this.parties.get(p.partyId);requireValue(party,'Partyt har avslutats.');return party;}
  duelOf(p){return this.partyOf(p).duels.find(d=>d.players.includes(p.id));}
  active(party){return party.players.map(id=>this.players.get(id)).filter(p=>p&&!p.withdrawn);}
  command(p,message){
    const party=this.partyOf(p),now=this.now();party.lastActivity=now;
    requireValue(message&&typeof message==='object','Ogiltigt kommando.');
    if(message.type==='ping')return {type:'pong',sent:message.sent,now};
    if(message.type==='input'){
      const next=inputState(message);if(next.seq<=p.input.seq)return;
      if(next.epoch!==(p.motion?.epoch??0))return this.snapshot(p);
      p.input=next;p.inputAt=now;
      if(this.duelOf(p)?.phase==='live'){p.pendingInputs.push(next);if(p.pendingInputs.length>64)p.pendingInputs.shift();}
      return;
    }
    if(message.type==='leave'){this.leave(p);return;}
    if(message.type==='subject'){
      requireValue(!party.testMode,'Solotestet använder bara testfrågor.');
      requireValue(p.id===party.hostId&&['lobby','finished'].includes(party.phase),'Bara värden kan välja ämne före spelstart.');
      requireValue(this.catalog.sections.some(s=>s.id===message.section),'Ämnet finns inte.');party.section=message.section;return;
    }
    if(message.type==='lobby'){
      requireValue(!party.testMode,'Starta ett nytt testpass eller lämna testläget.');
      requireValue(p.id===party.hostId&&party.phase==='finished','Vänta tills omgången är färdig.');
      party.phase='lobby';party.duels=[];this.removeWithdrawn(party);return;
    }
    if(message.type==='start'){
      requireValue(p.id===party.hostId&&['lobby','finished'].includes(party.phase),'Bara värden kan starta en ny omgång.');
      this.removeWithdrawn(party);const active=this.active(party);
      requireValue(active.length>=2&&active.every(p=>p.connected),'Minst två spelare behöver vara anslutna innan ni startar.');
      this.startTraining(party);return;
    }
    if(message.type==='answer'){
      requireValue(party.phase==='training'&&!p.trainingComplete,'Frågepasset är avslutat.');
      const q=party.questions[p.questionIndex];requireValue(q&&q.id===message.questionId,'Den frågan är inte aktiv.');
      requireValue(q.options.includes(message.answer),'Välj ett av svarsalternativen.');
      if(p.answers[p.questionIndex])return; // Retry/reconnect must never issue a second reward.
      const correct=message.answer===q.answer;
      p.answers.push({questionId:q.id,chosen:message.answer,correct,answer:q.answer,earned:correct?RULES.correctCredits:0});
      p.budget=budget(p.answers.filter(a=>a.correct).length);p.credits=p.budget;return;
    }
    if(message.type==='next'){
      requireValue(party.phase==='training'&&p.answers[p.questionIndex],'Svara på frågan först.');
      p.questionIndex++;if(p.questionIndex>=party.questions.length)p.trainingComplete=true;
      this.checkTraining(party);return;
    }
    const duel=this.duelOf(p);requireValue(duel,'Du har ingen aktiv duell just nu.');
    if(message.type==='demo-drill'){
      requireValue(party.demoMode==='vandal'&&!p.bot&&['target','wall'].includes(message.drill),'Välj en övning som finns i Vandal-demon.');
      party.demoDrill=message.drill;return this.command(p,{type:'reset-demo'});
    }
    if(message.type==='demo-target'){
      requireValue(party.demoMode==='vandal'&&party.demoDrill!=='wall'&&!p.bot,'Målstyrningen finns bara i Vandal-demon.');
      party.demoTargetMoving=message.moving===true;return;
    }
    if(message.type==='reset-demo'){
      requireValue(party.demoMode==='vandal'&&!p.bot,'Återställningen finns bara i Vandal-demon.');
      party.demoTargetMoving=false;duel.round++;duel.targetRespawnAt=0;duel.events=[];duel.score=Object.fromEntries(duel.players.map(id=>[id,0]));this.spawn(duel);duel.phase='live';
      for(const id of duel.players){const member=this.players.get(id);member.equipUntil=now+WEAPONS.vandal.equip*1000;member.stats={wins:0,rounds:0,kills:0,deaths:0};}
      return;
    }
    if(message.type==='buy'){
      requireValue(duel.phase==='buy','Köptiden är avslutad.');
      const weapon=message.weapon??p.weapon,armor=message.armor??p.armor;
      requireValue(Object.hasOwn(WEAPONS,weapon)&&!WEAPONS[weapon].melee&&Object.hasOwn(ARMOR,armor),'Utrustningen finns inte.');
      const price=WEAPONS[weapon].price+ARMOR[armor].price;requireValue(price<=p.budget,'Dina krediter räcker inte till den utrustningen.');
      p.weapon=weapon;p.armor=armor;p.credits=p.budget-price;p.ready=false;return;
    }
    if(message.type==='ready'){
      requireValue(duel.phase==='buy','Matchen har redan börjat.');p.ready=true;
      if(duel.players.every(id=>this.players.get(id)?.ready))this.countdown(duel);return;
    }
    requireValue(duel.phase==='live'&&p.body?.health>0,'Vänta tills nästa runda.');
    if(message.type==='reload'){this.reload(p);return;}
    if(message.type==='switch'){
      if(![1,2,3].includes(message.slot)||message.slot===p.slot)return;
      const next=p.inventory[message.slot===3?'melee':message.slot===2?'sidearm':'primary'];if(!next)return;
      this.gun(p).reloadAt=0;this.gun(p).bufferedAltAt=0;p.slot=message.slot;p.equipUntil=now+WEAPONS[next.id].equip*1000;
      p.recoilPitch=0;p.recoilYaw=0;p.shotCount=0;p.recoilSide=0;p.burstCount=0;return;
    }
    throw new Error('Kommandot stöds inte.');
  }
  startTraining(party){
    party.questions=party.testMode?testQuestions():this.catalog.choose(party.section,RULES.questions,party.used);
    if(!party.testMode)for(const q of party.questions)party.used.add(q.id);
    party.phase='training';party.duels=[];party.schedule=[];party.waveIndex=-1;party.waveEndsAt=0;party.notice='';
    for(const player of this.active(party))Object.assign(player,{answers:[],questionIndex:0,trainingComplete:player.bot,budget:budget(0),credits:budget(0),weapon:'classic',armor:'none',ready:false,body:null,stats:{wins:0,rounds:0,kills:0,deaths:0}});
  }
  leave(p){
    const party=this.partyOf(p);
    if(party.testMode&&!p.bot){this.removeParty(party);return;}
    p.withdrawn=true;p.connected=false;this.tokens.delete(p.token);
    const duel=this.duelOf(p);if(duel&&duel.phase!=='finished')this.forfeit(duel,p.id);
    if(party.hostId===p.id)party.hostId=this.active(party).find(p=>p.connected)?.id??this.active(party)[0]?.id??null;
    if(['lobby','finished'].includes(party.phase))this.removeWithdrawn(party);
    if(party.phase==='training')this.checkTraining(party);
  }
  removeParty(party){
    for(const id of party.players){const player=this.players.get(id);if(player)this.tokens.delete(player.token);this.players.delete(id);}
    party.phase='finished';party.duels=[];this.parties.delete(party.code);
  }
  removeWithdrawn(party){party.players=party.players.filter(id=>{const p=this.players.get(id);if(p?.withdrawn){this.players.delete(id);return false;}return !!p;});}
  checkTraining(party){
    const players=this.active(party);
    if(players.length<2){party.phase='lobby';party.notice='Ni behöver minst två spelare för att fortsätta.';return;}
    if(players.every(p=>p.trainingComplete)){party.schedule=scheduleRoundRobin(players.map(p=>p.id));this.startWave(party,0);}
  }
  startWave(party,index){
    if(index>=party.schedule.length){party.phase='finished';party.duels=[];party.waveEndsAt=0;return;}
    party.phase='matches';party.waveIndex=index;party.waveEndsAt=0;
    party.duels=party.schedule[index].pairs.map(ids=>({id:randomUUID(),players:ids,score:Object.fromEntries(ids.map(id=>[id,0])),round:1,phase:'buy',endsAt:this.now()+RULES.buySeconds*1000,winnerId:null,roundWinner:null,reason:'',events:[]}));
    for(const duel of party.duels){
      for(const id of duel.players){const p=this.players.get(id);if(p){p.credits=p.budget;p.weapon='classic';p.armor='none';p.ready=p.bot;}}
      this.spawn(duel);
      for(const id of duel.players)if(!this.players.get(id)||this.players.get(id).withdrawn)this.forfeit(duel,id);
    }
  }
  spawn(duel){
    duel.events=[];
    duel.players.forEach((id,i)=>{const p=this.players.get(id);if(!p)return;const party=this.partyOf(p),spawn=party.demoMode==='vandal'&&party.demoDrill==='wall'&&!p.bot?DEMO_WALL.spawn:party.testMode?TEST_SPAWNS[p.bot?1:0]:MAP.spawns[(i+duel.round-1)%2];
      p.body=makeBody(spawn);p.body.shield=ARMOR[p.armor].shield;if(party.demoMode==='vandal'&&party.demoDrill==='wall'&&p.bot){p.body.health=0;p.body.shield=0;}
      const gun=id=>({id,ammo:WEAPONS[id].mag,reserve:WEAPONS[id].reserve,reloadAt:0,nextShotAt:0,bufferedAltAt:0});
      const sidearm=WEAPONS[p.weapon].category==='PISTOL';p.slot=sidearm?2:1;
      p.inventory={primary:sidearm?null:gun(p.weapon),sidearm:gun(sidearm?p.weapon:'classic'),melee:gun('knife')};
      p.input=inputState({yaw:spawn.yaw,seq:p.input.seq});p.appliedInput=p.input;p.pendingInputs=[];p.inputAt=0;p.fireHeld=false;p.altHeld=false;p.firePress=0;p.altPress=0;p.lastShot=0;p.shotCount=0;p.shotSerial=0;p.demoStrafeDirection=1;p.burstCount=0;p.lastBurst=0;p.recoilPitch=0;p.recoilYaw=0;p.recoilSide=0;p.yawSwitchAt=0;p.equipUntil=0;p.tagUntil=0;
      p.body.seq=p.input.seq;p.motion=new MovementTimeline(p.body,p.input);p.sentOpponentPoses=[];p.viewSequence=0;
    });
  }
  countdown(duel){this.spawn(duel);duel.phase='countdown';duel.endsAt=this.now()+3000;duel.roundWinner=null;}
  gun(p){return p.inventory?.[p.slot===3?'melee':p.slot===2?'sidearm':'primary'];}
  reload(p){const gun=this.gun(p),weapon=WEAPONS[gun.id];if(!gun.reloadAt&&gun.ammo<weapon.mag&&gun.reserve>0){gun.bufferedAltAt=0;gun.reloadAt=this.now()+weapon.reload*1000;}}
  shoot(p,opponent,duel,alternate=false,input=p.appliedInput??p.input){
    const now=this.now(),gun=this.gun(p),w=WEAPONS[gun.id],profile=fireProfile(w,input,alternate);
    if(gun.reloadAt||now<p.equipUntil||now<gun.nextShotAt)return [];
    if(!w.melee&&gun.ammo<=0){this.reload(p);return [];}
    const count=w.melee?1:Math.min(profile.pellets,gun.ammo),hits=[],volleyId=++this.volleyId,shotSerial=p.shotSerial=(p.shotSerial??0)+1;
    if(now-p.lastBurst>750)p.burstCount=0;
    const shotBody=p.motion?.presentationAt(input.ownSeq,input.ownAlpha,now)??p.body;
    const spread=shotSpread(w,shotBody,{...input,crouch:shotBody.crouch},alternate&&w.burst?p.burstCount:p.shotCount,alternate);
    const origin=[shotBody.x,shotBody.y+(shotBody.crouch?RULES.crouchEye:RULES.eye),shotBody.z];
    const history=p.sentOpponentPoses??[];
    const targetBody=validatedViewPose(history,input,now)??opponent.body;
    for(let pellet=0;pellet<count;pellet++){
      const angle=this.random()*Math.PI*2,radius=Math.sqrt(this.random())*spread;
      const yaw=input.yaw+p.recoilYaw+Math.cos(angle)*radius,pitch=clamp(input.pitch+p.recoilPitch+Math.sin(angle)*radius,-1.55,1.55);
      const melee=w.melee?meleeStrike(origin,yaw,pitch,targetBody,alternate):null;
      const dir=melee?.direction??[-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
      const wall=melee?.distance??wallDistance(origin,dir),hit=hitBody(origin,dir,targetBody),hitPlayer=opponent.body.health>0&&(melee?.hit??hit.distance<wall);
      const distance=hitPlayer?hit.distance:wall;
      let damage=hitPlayer?(distance>w.range?w.farDamage:w.damage)[hit.zone]:0;
      if(w.melee&&hitPlayer){
        const dx=shotBody.x-targetBody.x,dz=shotBody.z-targetBody.z;
        const behind=(-Math.sin(targetBody.yaw)*dx-Math.cos(targetBody.yaw)*dz)/Math.max(.001,Math.hypot(dx,dz))<-.5;
        damage=(alternate?75:50)*(behind?2:1);
      }
      const event={id:++this.eventId,volleyId,shotSerial,inputSeq:input.seq,at:now,kind:'shot',shooterId:p.id,weapon:w.id,origin,end:origin.map((n,i)=>n+dir[i]*distance),targetId:hitPlayer?opponent.id:null,zone:hitPlayer?(w.melee?1:hit.zone):null,killed:false};
      duel.events.push(event);
      if(hitPlayer)hits.push({target:opponent,shooter:p,damage,event});
    }
    if(!w.melee)gun.ammo-=count;
    gun.nextShotAt=shotDeadline(gun.nextShotAt,now,profile.rate);gun.bufferedAltAt=0;p.lastShot=now;if(alternate&&w.burst){p.lastBurst=now;p.burstCount++;}if(!w.melee)advanceRecoil(p,w,now,this.random,input,shotBody);
    return hits;
  }
  finishRound(duel,winnerId,reason){
    if(duel.phase!=='live')return;
    duel.roundWinner=winnerId;duel.reason=reason;
    if(winnerId){duel.score[winnerId]++;this.players.get(winnerId).stats.rounds++;}
    if(winnerId&&duel.score[winnerId]>=RULES.wins){duel.phase='finished';duel.winnerId=winnerId;this.players.get(winnerId).stats.wins++;}
    else duel.phase='result';duel.endsAt=this.now()+RULES.resultSeconds*1000;
  }
  forfeit(duel,loserId){
    if(duel.phase==='finished')return;
    const winner=duel.players.find(id=>id!==loserId),p=this.players.get(winner);
    duel.phase='finished';duel.winnerId=winner;duel.roundWinner=winner;duel.reason='Motståndaren lämnade matchen.';
    duel.score[winner]=RULES.wins;if(p)p.stats.wins++;duel.endsAt=this.now()+RULES.resultSeconds*1000;
  }
  tick(dt=1/RULES.tickRate){
    const now=this.now();this.tickCount++;
    for(const party of this.parties.values()){
      for(const p of this.active(party))if(!p.connected&&now-p.disconnectedAt>RULES.reconnectSeconds*1000){this.leave(p);}
      if(!this.parties.has(party.code))continue;
      if(party.phase==='training')this.checkTraining(party);
      if(party.phase!=='matches')continue;
      for(const duel of party.duels){
        const players=duel.players.map(id=>this.players.get(id));
        if(party.demoMode==='vandal'&&party.demoDrill!=='wall'&&duel.targetRespawnAt&&now>=duel.targetRespawnAt){
          const target=players.find(p=>p.bot);target.body=makeBody(TEST_SPAWNS[1]);target.body.shield=ARMOR.heavy.shield;target.motion=new MovementTimeline(target.body,target.input);target.pendingInputs=[];target.sentOpponentPoses=[];duel.targetRespawnAt=0;
        }
        if(duel.phase==='buy'&&!party.testMode&&now>=duel.endsAt)this.countdown(duel);
        else if(duel.phase==='countdown'&&now>=duel.endsAt){duel.phase='live';duel.endsAt=now+RULES.roundSeconds*1000;for(const p of players)if(p){p.inputAt=0;p.pendingInputs=[];}}
        else if(duel.phase==='result'&&now>=duel.endsAt){duel.round++;this.countdown(duel);}
        if(duel.phase!=='live')continue;
        const hits=[];
        for(const p of players){
          if(!p||p.body.health<=0)continue;
          if(party.demoMode==='vandal'&&p.bot){
            if(p.body.z<-10.8)p.demoStrafeDirection=-1;else if(p.body.z>-7.2)p.demoStrafeDirection=1;
            p.input=inputState({seq:p.input.seq+1,epoch:p.motion.epoch,yaw:TEST_SPAWNS[1].yaw,strafe:party.demoTargetMoving?p.demoStrafeDirection??1:0,active:false});
            p.pendingInputs.push(p.input);p.inputAt=now;
          }
          p.motion.step(p.pendingInputs,{now,dt,weapon:WEAPONS[this.gun(p).id],fresh:now-p.inputAt<=300,tagged:now<p.tagUntil});p.appliedInput=p.motion.control;
          const gun=this.gun(p),w=WEAPONS[gun.id];if(gun.reloadAt&&now>=gun.reloadAt){const count=Math.min(w.mag-gun.ammo,gun.reserve);gun.ammo+=count;gun.reserve-=count;gun.reloadAt=0;}
          if(w.id==='vandal'){const recovery=recoverVandalRecoil(p.recoilPitch,p.recoilYaw,(now-p.lastShot)/1000,dt);p.recoilPitch=recovery.pitch;p.recoilYaw=recovery.yaw;if(recovery.recovered){p.shotCount=0;p.recoilSide=0;}}
          else if(now-p.lastShot>w.recovery*1000){p.recoilPitch=Math.max(0,p.recoilPitch-dt*.7);p.recoilYaw=Math.sign(p.recoilYaw)*Math.max(0,Math.abs(p.recoilYaw)-dt*.3);if(!p.recoilPitch&&!p.recoilYaw){p.shotCount=0;p.recoilSide=0;}}
        }
        for(const p of this.tickCount%2?players:[...players].reverse()){
          if(!p||p.body.health<=0)continue;
          const opponent=players.find(other=>other&&other.id!==p.id);
          const input=p.appliedInput,gun=this.gun(p),w=WEAPONS[gun.id];
          const pressed=input.fire&&!p.fireHeld||input.firePress>p.firePress,altPressed=(w.burst>0||w.melee)&&(input.altFire&&!p.altHeld||input.altPress>p.altPress);
          if(!input.active||now-p.inputAt>300)gun.bufferedAltAt=0;
          else if(altPressed&&w.burst&&!gun.reloadAt&&now>=p.equipUntil&&gun.nextShotAt>now&&gun.nextShotAt-now<=225)gun.bufferedAltAt=gun.nextShotAt;
          const buffered=gun.bufferedAltAt>0&&now>=gun.bufferedAltAt,primary=input.fire&&w.auto||pressed,alternate=altPressed||buffered;
          const shotInput=(pressed||altPressed)&&!buffered?{...input,aim:input.triggerAim,zoomLevel:input.triggerZoomLevel,yaw:input.triggerYaw,pitch:input.triggerPitch,viewTime:input.triggerViewTime,viewFromId:input.triggerFromId,viewToId:input.triggerToId,ownSeq:input.triggerOwnSeq,ownAlpha:input.triggerOwnAlpha}:input;
          if(opponent&&(opponent.body.health>0||party.demoMode==='vandal')&&input.active&&now-p.inputAt<=300&&(primary||alternate))hits.push(...this.shoot(p,opponent,duel,alternate,shotInput));
          p.fireHeld=input.fire;p.altHeld=input.altFire;p.firePress=input.firePress;p.altPress=input.altPress;
        }
        for(const hit of hits){if(hit.target.body.health<=0)continue;hit.target.tagUntil=now+RULES.tagSeconds*1000;if(applyDamage(hit.target.body,hit.damage)){hit.event.killed=true;hit.shooter.stats.kills++;hit.target.stats.deaths++;}}
        const dead=players.filter(p=>p?.body.health<=0);
        if(party.demoMode==='vandal'&&dead.some(p=>p.bot)){
          if(party.demoDrill!=='wall'&&!duel.targetRespawnAt){duel.targetRespawnAt=now+1000;const human=players.find(p=>!p.bot);duel.score[human.id]++;}
        }
        else if(dead.length)this.finishRound(duel,dead.length===2?null:players.find(p=>p&&p.body.health>0)?.id??null,dead.length===2?'Ni slog ut varandra.':'Eliminering');
        else if(!party.testMode&&now>=duel.endsAt){const [a,b]=players,ah=a.body.health+a.body.shield,bh=b.body.health+b.body.shield;this.finishRound(duel,Math.abs(ah-bh)<.01?null:ah>bh?a.id:b.id,'Tiden tog slut. Mest hälsa och rustning vinner.');}
        duel.events=duel.events.filter(event=>now-event.at<1500).slice(-60);
      }
      if(party.duels.every(d=>d.phase==='finished')){
        if(!party.waveEndsAt)party.waveEndsAt=now+RULES.waveSeconds*1000;
        if(now>=party.waveEndsAt)this.startWave(party,party.waveIndex+1);
      }
    }
  }
  snapshot(p){
    const now=this.now(),party=this.partyOf(p),duel=this.duelOf(p),question=party.questions[p.questionIndex];
    const ownGun=this.gun(p),ownWeapon=ownGun?WEAPONS[ownGun.id]:WEAPONS[p.weapon];
    const rival=duel?this.players.get(duel.players.find(id=>id!==p.id)):null;
    const poseId=rival?.body?++p.viewSequence:0;
    if(rival?.body&&p.sentOpponentPoses)rememberPose(p.sentOpponentPoses,now,rival.body,poseId);
    const confirmed=duel?.phase==='live'&&now-p.inputAt<=300?p.motion?.confirmed:null;
    const ownBody=confirmed&&p.body?{...confirmed,health:p.body.health,shield:p.body.shield}:p.body;
    const feedback=p.answers[p.questionIndex]??null;
    return {type:'state',protocol:RULES.protocolVersion,now,party:{code:party.code,hostId:party.hostId,section:party.section,testMode:party.testMode,demoMode:party.demoMode??null,demoDrill:party.demoDrill??'target',demoTargetMoving:party.demoTargetMoving===true,phase:party.phase,wave:party.waveIndex+1,waves:party.schedule.length,waveEndsAt:party.waveEndsAt,notice:party.notice,
      members:party.players.map(id=>this.players.get(id)).filter(Boolean).map(p=>({id:p.id,name:p.name,bot:p.bot,connected:p.connected,withdrawn:p.withdrawn,progress:p.answers.length,complete:p.trainingComplete,stats:p.stats})),
      matches:party.duels.map(d=>({id:d.id,players:d.players,score:d.score,phase:d.phase,winnerId:d.winnerId}))},
      self:{id:p.id,name:p.name,body:ownBody,previousBody:confirmed?p.motion.confirmedPrevious:p.body,motionEpoch:p.motion?.epoch??0,motionStale:p.motion?.needsResync??false,budget:p.budget,credits:p.credits,weapon:p.weapon,activeWeapon:ownWeapon.id,armor:p.armor,ready:p.ready,slot:p.slot??1,
        ammo:ownGun?.ammo??ownWeapon.mag,reserve:ownGun?.reserve??ownWeapon.reserve,reloadAt:ownGun?.reloadAt??0,equipUntil:p.equipUntil??0,
        recoilPitch:p.recoilPitch,recoilYaw:p.recoilYaw,lastShot:p.lastShot,shotCount:p.shotCount,shotSerial:p.shotSerial??0,questionIndex:p.questionIndex,trainingComplete:p.trainingComplete,
        correct:p.answers.filter(a=>a.correct).length,feedback,question:party.phase==='training'&&question?{id:question.id,section:question.section,number:question.number,pages:question.pages,paperId:question.paperId,title:question.title,sourceUrl:question.sourceUrl,options:question.options,...(party.testMode?{testMode:true,prompt:question.prompt,optionLabels:question.optionLabels}:{})}:null},
      duel:duel?{id:duel.id,phase:duel.phase,score:duel.score,round:duel.round,endsAt:duel.endsAt,winnerId:duel.winnerId,roundWinner:duel.roundWinner,reason:duel.reason,events:duel.events,
        opponent:rival?{id:rival.id,poseId,name:rival.name,connected:rival.connected,ready:rival.ready,body:rival.body?{...rival.body,health:rival.body.health>0?100:0,shield:0}:null,weapon:this.gun(rival)?.id??rival.weapon}:null}:null};
  }
  cleanup(){for(const party of this.parties.values()){if(this.active(party).some(p=>!p.bot&&p.connected)||this.now()-party.lastActivity<20*60_000)continue;this.removeParty(party);}}
}
