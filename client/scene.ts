import * as THREE from 'three';
import {MAP,RULES,WEAPONS,moveBody,inputState,clamp} from '../shared/rules.mjs';
import {normalizeControls,lookScale,verticalFov,effectiveZoom,reconcileBody,pressMouse} from '../shared/controls.mjs';
import {fireProfile,shotDeadline} from '../shared/gunplay.mjs';
import {PRESENTATION,blendPose,rememberPose,presentPose} from '../shared/presentation.mjs';
import {meleeStrike} from '../shared/melee.mjs';
import {stanceDimensions,createGaitState,resetGait,advanceGait} from '../shared/movement.mjs';
import {makePracticeAgent} from './agent-view';
import {createArenaRecorder,type ArenaRecorderOptions,type ArenaRecorder} from './arena-recording';
import {buildTrainingRange} from './training-range';
import {createVandalRecoilPresenter} from '../shared/recoil-presentation.mjs';
import {createKeyboardInput} from '../shared/keyboard-input.mjs';
import {WeaponView,makeVandalModel} from './weapon-view';
import {playVandalShot,playVandalMechanical} from './weapon-audio';
import type {Body,Input,State,Shot} from './types';

const weaponFor=(id:string)=>(WEAPONS as Record<string,typeof WEAPONS.vandal>)[id]??WEAPONS.classic;
const mat=(color:string,roughness=.85,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
function box(parent:THREE.Object3D,size:number[],position:number[],material:THREE.Material){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size as [number,number,number]),material);mesh.position.set(...position as [number,number,number]);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function label(text:string,width=3,height=1,color='#f5efe2',background='#28444b'){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=256;
  const c=canvas.getContext('2d')!;c.fillStyle=background;c.fillRect(0,0,768,256);c.fillStyle=color;c.font='bold 130px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,384,139);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture}));
}
function buildMap(scene:THREE.Scene){
  const rangeOccluders:THREE.Object3D[]=[];
  const stone=mat('#d2bf9b'),light=mat('#ecdfbd'),trim=mat('#976b51'),teal=mat('#3b686b',.75,.1),dark=mat('#243c45'),orange=mat('#bb7151');
  const ground=mat('#c3ba9f');box(scene,[60,.5,44],[0,-.25,0],ground);
  // A readable three-lane arena. Every playable solid uses the shared collision layout.
  for(let x=-22;x<=22;x+=2){box(scene,[.025,.007,32],[x,.005,0],mat('#b3a88e'));}
  for(let z=-14;z<=14;z+=2){box(scene,[48,.007,.025],[0,.006,z],mat('#b3a88e'));}
  for(const z of [-9,9])box(scene,[44,.014,2.1],[0,.012,z],mat('#aa9c80'));
  for(const block of MAP.blocks){
    const {x,z,w,d,h,type}=block;
    const material=type==='crate'?teal:type==='cover'?orange:type==='tower'?light:stone;
    box(scene,[w,h,d],[x,h/2,z],material);
    box(scene,[w+.14,.13,d+.14],[x,h+.065,z],type==='crate'?dark:trim);
    if(type==='crate'){
      for(const side of [-1,1]){
        box(scene,[w-.22,.09,.04],[x,.24,z+side*(d/2+.02)],light);
        box(scene,[.12,h-.24,.08],[x-w/2+.18,h/2,z+side*(d/2+.03)],dark);
        box(scene,[.12,h-.24,.08],[x+w/2-.18,h/2,z+side*(d/2+.03)],dark);
        const stripe=box(scene,[w*.8,.08,.06],[x,h*.5,z+side*(d/2+.04)],mat('#d3ae61'));stripe.rotation.z=.36*side;
      }
    }
    if(type==='tower'){
      for(const side of [-1,1]){
        box(scene,[.15,h,.16],[x-w/2+.05,h/2,z+side*d/2],trim);
        box(scene,[.15,h,.16],[x+w/2-.05,h/2,z+side*d/2],trim);
        const sign=label('N / 01',3.2,.9);sign.position.set(x,3.5,z+side*(d/2+.02));sign.rotation.y=side<0?Math.PI:0;scene.add(sign);
      }
      box(scene,[2,1,2],[x,h+.55,z],teal);
      const antenna=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,3,6),dark);antenna.position.set(x,h+2,z);scene.add(antenna);
    }
    if(type==='boundary'){
      const alongX=w>d;
      for(let offset=-(alongX?w:d)/2+3;offset<(alongX?w:d)/2;offset+=6){
        const bx=x+(alongX?offset:0),bz=z+(alongX?0:offset);
        const pillar=box(scene,alongX?[.4,h+.5,d+.02]:[w+.02,h+.5,.4],[bx,(h+.5)/2,bz],light);
        const sx=bx+(alongX?0:x>0?-.475:.475),sz=bz+(alongX?z>0?-.475:.475:0);
        const window=box(scene,alongX?[2.3,1.5,.09]:[.09,1.5,2.3],[sx,4,sz],teal);
        window.castShadow=false;if(x>24&&Math.abs(bz)<4.2)rangeOccluders.push(pillar,window);
      }
      const base=box(scene,[w+.04,.6,d+.04],[x,.35,z],trim);if(x>24)rangeOccluders.push(base);
    }
    if(type==='building'){
      box(scene,[w+.3,.25,d+.3],[x,h+.2,z],orange);
      for(const side of [-1,1])box(scene,[.8,1.5,.09],[x,h*.52,z+side*(d/2+.01)],teal);
    }
  }
  const sunTrim=mat('#e2c678');
  for(const [i,spawn] of MAP.spawns.entries()){
    const disc=new THREE.Mesh(new THREE.RingGeometry(1.7,1.78,48),new THREE.MeshBasicMaterial({color:i===0?'#4d8183':'#c38665',side:THREE.DoubleSide}));disc.rotation.x=-Math.PI/2;disc.position.set(spawn.x,.025,spawn.z);scene.add(disc);
    const sign=label(i===0?'01':'02',2.2,1.1);sign.position.set(i===0?-23.96:23.96,2,0);sign.rotation.y=i===0?Math.PI/2:-Math.PI/2;scene.add(sign);if(i===1)rangeOccluders.push(sign);
  }
  // Skyline, plaster roof details and utility cables sit outside the playable walls.
  for(let i=0;i<12;i++){
    const h=6+(i*7%5),x=-28+i*5;
    box(scene,[4,h,5],[x,h/2,-23],i%3?stone:orange);
    box(scene,[4.4,.25,5.3],[x,h,-23],trim);
    for(let j=0;j<2;j++)box(scene,[.7,1,.05],[x-1+j*2,h-2,-20.45],teal);
  }
  for(const z of [-15.9,15.9]){
    box(scene,[44,.08,.08],[0,5.7,z],dark);
    for(let x=-20;x<=20;x+=8)box(scene,[.35,.28,.2],[x,5.45,z],sunTrim);
  }
  const banner=label('N I V Å',6,1.5);banner.position.set(0,5.3,15.96);banner.rotation.y=Math.PI;scene.add(banner);
  return rangeOccluders;
}
function weaponModel(id:string){
  if(id==='vandal')return makeVandalModel().group;
  const group=new THREE.Group(),dark=mat('#202f39',.5,.45),steel=mat('#52646c',.4,.65),accent=mat(id==='phantom'?'#63b1a6':'#d9ac73',.5,.4),grip=mat('#111e28');
  const pistol=['classic','ghost','sheriff'].includes(id),sniper=id==='operator';
  if(id==='knife'){
    box(group,[.075,.1,.24],[0,-.02,0],grip);box(group,[.19,.04,.055],[0,.02,-.14],accent);
    box(group,[.085,.025,.35],[0,.025,-.33],steel);const tip=new THREE.Mesh(new THREE.ConeGeometry(.058,.13,3),steel);tip.rotation.x=-Math.PI/2;tip.position.set(0,.025,-.57);group.add(tip);return group;
  }
  box(group,pistol?[.12,.14,.34]:[.17,.18,.58],[0,.025,-.18],dark);
  box(group,pistol?[.105,.06,.36]:[.13,.065,.55],[0,.12,-.18],steel);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(pistol?.027:.035,pistol?.027:.035,pistol?.24:sniper?.9:.55,10),steel);barrel.rotation.x=Math.PI/2;barrel.position.set(0,.055,pistol?-.45:sniper?-.94:-.71);group.add(barrel);
  box(group,[.09,.21,.11],[0,-.13,.02],grip).rotation.x=-.24;
  if(!pistol){
    box(group,[.12,.11,.3],[0,.025,.22],dark);
    box(group,[.1,.25,.14],[0,-.18,-.12],steel).rotation.x=id==='vandal'?-.2:.06;
    box(group,[.18,.06,.34],[0,-.025,-.55],grip);
    box(group,[.035,.08,.15],[.075,.06,-.23],accent);
    if(id==='phantom')box(group,[.07,.075,.22],[0,.055,-.95],dark);
  }
  if(sniper||id==='guardian'){
    const scope=new THREE.Mesh(new THREE.CylinderGeometry(sniper?.065:.04,sniper?.065:.04,sniper?.36:.16,12),dark);scope.rotation.x=Math.PI/2;scope.position.set(0,.21,-.23);group.add(scope);
    const glass=new THREE.Mesh(new THREE.CircleGeometry(sniper?.055:.032,12),new THREE.MeshBasicMaterial({color:'#67bfc0'}));glass.position.set(0,.21,sniper?-.045:-.145);group.add(glass);
  }else{
    box(group,[.035,.035,.03],[0,.17,pistol?-.25:-.48],accent);
    box(group,[.07,.035,.035],[0,.17,.01],steel);
  }
  if(id==='sheriff'){
    const cylinder=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.13,8),steel);cylinder.rotation.z=Math.PI/2;cylinder.position.set(0,-.01,-.08);group.add(cylinder);
  }
  return group;
}
class Audio {
  context:AudioContext|null=null;bus:GainNode|null=null;recordingDestination:MediaStreamAudioDestinationNode|null=null;muted=false;
  unlock(){if(!this.context){this.context=new AudioContext();this.bus=this.context.createGain();this.recordingDestination=this.context.createMediaStreamDestination();this.bus.connect(this.context.destination);this.bus.connect(this.recordingDestination);}void this.context.resume();}
  impact(){
    if(this.muted||!this.context||this.context.state!=='running')return;
    const ctx=this.context,t=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='triangle';osc.frequency.setValueAtTime(220,t);osc.frequency.exponentialRampToValueAtTime(70,t+.045);gain.gain.setValueAtTime(.1,t);gain.gain.exponentialRampToValueAtTime(.001,t+.06);osc.connect(gain).connect(this.bus??ctx.destination);osc.start(t);osc.stop(t+.065);
  }
  step(own:boolean,distance=0,pan=0){
    if(this.muted||!this.context||this.context.state!=='running'||distance>26)return;
    const ctx=this.context,t=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain(),panner=ctx.createStereoPanner();
    osc.type='triangle';osc.frequency.setValueAtTime(155,t);osc.frequency.exponentialRampToValueAtTime(45,t+.065);
    gain.gain.setValueAtTime((own?.055:.09)/(1+distance*.18),t);gain.gain.exponentialRampToValueAtTime(.001,t+.08);panner.pan.value=clamp(pan,-1,1);
    osc.connect(gain).connect(panner).connect(this.bus??ctx.destination);osc.start(t);osc.stop(t+.085);
  }
  hit(head:boolean,killed:boolean){
    if(this.muted||!this.context||this.context.state!=='running')return;
    const ctx=this.context,t=ctx.currentTime;
    for(let i=0;i<(killed?2:1);i++){const osc=ctx.createOscillator(),gain=ctx.createGain(),start=t+i*.075;osc.type=head?'sine':'triangle';osc.frequency.setValueAtTime((head?1300:340)*(i?1.25:1),start);osc.frequency.exponentialRampToValueAtTime(head?820:160,start+.055);gain.gain.setValueAtTime(head?.045:.025,start);gain.gain.exponentialRampToValueAtTime(.001,start+.085);osc.connect(gain).connect(this.bus??ctx.destination);osc.start(start);osc.stop(start+.09);}
  }
  shot(weapon:string,own:boolean,distance=0,pan=0){
    if(this.muted||!this.context||this.context.state!=='running')return;
    if(weapon==='vandal'){playVandalShot(this.context,(own?.23:.15)/(1+distance*.04),own?0:pan,this.bus??this.context.destination);return;}
    const silenced=['ghost','spectre','phantom'].includes(weapon);if(silenced&&!own&&distance>40)return;
    const ctx=this.context,t=ctx.currentTime,duration=weapon==='operator'?.23:.12;
    const samples=new Float32Array(Math.floor(ctx.sampleRate*duration));for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*Math.pow(1-i/samples.length,3);
    const buffer=ctx.createBuffer(1,samples.length,ctx.sampleRate);buffer.copyToChannel(samples,0);
    const noise=ctx.createBufferSource();noise.buffer=buffer;
    const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=weapon==='knife'?900:own?(silenced?2800:4300):1700;
    const gain=ctx.createGain(),panner=ctx.createStereoPanner();panner.pan.value=own?0:clamp(pan,-1,1);panner.connect(this.bus??ctx.destination);gain.gain.value=(weapon==='knife'?.07:silenced?.12:own?.2:.16)/(1+distance*.04);noise.connect(filter).connect(gain).connect(panner);noise.start(t);
    if(weapon==='knife')return;
    const osc=ctx.createOscillator(),thump=ctx.createGain();osc.type='triangle';osc.frequency.setValueAtTime(weapon==='operator'?95:160,t);osc.frequency.exponentialRampToValueAtTime(45,t+.09);thump.gain.setValueAtTime(own?.12:.04,t);thump.gain.exponentialRampToValueAtTime(.001,t+.12);osc.connect(thump).connect(panner);osc.start(t);osc.stop(t+.13);
  }
}
export class ArenaScene {
  renderer:THREE.WebGLRenderer;scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(78,1,.04,150);
  handsScene=new THREE.Scene();handsCamera=new THREE.PerspectiveCamera(65,1,.01,10);hands=new THREE.Group();gun=new THREE.Group();
  trainingRange:ReturnType<typeof buildTrainingRange>;rangeOccluders:THREE.Object3D[]=[];recorder:ArenaRecorder|null=null;recoilPresenter=createVandalRecoilPresenter();
  weaponView=new WeaponView();ownGait=createGaitState();enemyGait=createGaitState();lastLook={yaw:0,pitch:0};impacts:{mesh:THREE.Group;at:number;life:number}[]=[];
  avatar=makePracticeAgent();avatarWeapon=makeVandalModel().group;state:State|null=null;localBody:Body|null=null;input:Input=inputState({});
  audio=new Audio();controls=normalizeControls();locked=false;reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  pending:{input:Input}[]=[];accumulator=0;receivedAt=0;localEquipUntil=0;localNextShot=new Map<string,number>();predictedShots:{weapon:string;at:number;recoilId?:number}[]=[];seenVolleys=new Set<number>();
  previousBody:Body|null=null;opponentSamples:{at:number;id:number;body:Body}[]=[];frameDuration=1000/60;viewTime=0;bufferedAltAt=0;
  keyboard=createKeyboardInput();seen=new Set<number>();tracers:{mesh:THREE.Line;at:number}[]=[];shotAt=0;hitAt=0;damageAt=0;ownStep=0;enemyStep=0;flash:THREE.Mesh|null=null;currentWeapon='';roundKey='';lastFrame=0;lastSend=0;frame=0;disposed=false;
  send:(message:object)=>void;onLock:(value:boolean)=>void;onScore:(value:boolean)=>void;onHit:(head:boolean)=>void;onKill:(head:boolean)=>void;
  constructor(element:HTMLElement,{send,onLock,onScore,onHit,onKill=()=>{}}:{send:(message:object)=>void;onLock:(value:boolean)=>void;onScore:(value:boolean)=>void;onHit:(head:boolean)=>void;onKill?:(head:boolean)=>void}){
    this.send=send;this.onLock=onLock;this.onScore=onScore;this.onHit=onHit;this.onKill=onKill;
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.28;
    this.renderer.domElement.setAttribute('aria-label','Skärning, tredimensionell duellarena');element.append(this.renderer.domElement);
    this.scene.background=new THREE.Color('#b9ced1');this.scene.fog=new THREE.Fog('#c6d2cd',45,125);
    this.scene.add(new THREE.HemisphereLight('#dbeeff','#82734c',2.5));
    const sun=new THREE.DirectionalLight('#ffe3b6',3.2);sun.position.set(-16,28,14);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-32;sun.shadow.camera.right=32;sun.shadow.camera.top=25;sun.shadow.camera.bottom=-25;sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;this.scene.add(sun);
    this.rangeOccluders=buildMap(this.scene);this.trainingRange=buildTrainingRange(this.scene);this.avatarWeapon.scale.setScalar(.7);this.avatar.weaponAnchor.add(this.avatarWeapon);this.scene.add(this.avatar.group);
    this.handsScene.add(new THREE.HemisphereLight('#e9f3ff','#525b5b',3.8));const key=new THREE.DirectionalLight('#ffe7c3',3);key.position.set(-2,4,3);this.handsScene.add(key);this.handsScene.add(this.hands,this.weaponView.group);
    this.resize();window.addEventListener('resize',this.resize);document.addEventListener('pointerlockchange',this.lockChange);document.addEventListener('mousemove',this.mouseMove);document.addEventListener('mousedown',this.mouseDown);document.addEventListener('mouseup',this.mouseUp);document.addEventListener('keydown',this.keyDown);document.addEventListener('keyup',this.keyUp);window.addEventListener('blur',this.blur);document.addEventListener('visibilitychange',this.visibility);document.addEventListener('contextmenu',this.contextMenu);
    this.frame=requestAnimationFrame(this.render);
  }
  resize=()=>{const w=innerWidth,h=innerHeight;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.handsCamera.aspect=w/h;this.handsCamera.updateProjectionMatrix();};
  lock=async(event?:Pick<MouseEvent,'shiftKey'|'ctrlKey'>)=>{this.keyboard.syncModifiers(event??{});this.audio.unlock();try{await this.renderer.domElement.requestPointerLock({unadjustedMovement:true});}catch(error){if(error instanceof DOMException&&error.name==='NotSupportedError'){try{await this.renderer.domElement.requestPointerLock();}catch{this.resetInput();this.onLock(false);}}else{this.resetInput();this.onLock(false);}}};
  unlock=()=>{if(document.pointerLockElement===this.renderer.domElement)document.exitPointerLock();};
  lockChange=()=>{this.locked=document.pointerLockElement===this.renderer.domElement;if(!this.locked)this.resetInput();this.onLock(this.locked);};
  resetInput=()=>{this.keyboard.reset();Object.assign(this.input,{forward:0,strafe:0,jump:false,fire:false,altFire:false,aim:false,crouch:false,walk:false,zoomLevel:1});this.pending=[];this.accumulator=0;this.bufferedAltAt=0;this.emitInput();this.onScore(false);};
  blur=()=>{this.resetInput();this.unlock();};
  visibility=()=>{if(document.hidden)this.blur();};
  contextMenu=(e:MouseEvent)=>{if(this.locked){this.keyboard.syncModifiers(e);e.preventDefault();}};
  mouseMove=(e:MouseEvent)=>{if(!this.locked)return;this.keyboard.syncModifiers(e);const scale=lookScale(this.controls,weaponFor(this.state?.self.activeWeapon??'classic'),this.input);this.input.yaw-=e.movementX*scale;this.input.yaw=Math.atan2(Math.sin(this.input.yaw),Math.cos(this.input.yaw));this.input.pitch=clamp(this.input.pitch-e.movementY*scale,-1.553343,1.553343);};
  mouseDown=(e:MouseEvent)=>{
    if(!this.locked)return;this.keyboard.syncModifiers(e);const weapon=weaponFor(this.state?.self.activeWeapon??'classic');
    const action=pressMouse(this.input,weapon,e.button,this.controls,this.viewTime);
    if(action)this.predictShot(performance.now(),action==='alternate');
  };
  mouseUp=(e:MouseEvent)=>{if(this.locked)this.keyboard.syncModifiers(e);if(e.button===0)this.input.fire=false;if(e.button===2){this.input.altFire=false;const weapon=weaponFor(this.state?.self.activeWeapon??'classic');if((weapon.id==='operator'?this.controls.scopeMode:this.controls.aimMode)==='hold')this.input.aim=false;}};
  keyDown=(e:KeyboardEvent)=>{
    if(!this.locked)return;if(['Space','Tab','ControlLeft','ControlRight','ShiftLeft','ShiftRight'].includes(e.code))e.preventDefault();
    this.keyboard.keyDown(e);if(e.code==='Tab')this.onScore(true);if(e.repeat)return;
    if(e.code==='KeyY')this.weaponView.inspect(performance.now());
    if(e.code==='KeyR'){this.bufferedAltAt=0;this.send({type:'reload'});}if(['Digit1','Digit2','Digit3'].includes(e.code))this.switchWeapon(Number(e.code.at(-1)));
  };
  keyUp=(e:KeyboardEvent)=>{if(this.locked)this.keyboard.keyUp(e);else this.keyboard.reset();if(e.code==='Tab')this.onScore(false);};
  switchWeapon(slot:number){
    const chosen=weaponFor(this.state?.self.weapon??'classic');if(slot===1&&chosen.category==='PISTOL')return;
    const next=slot===3?WEAPONS.knife:slot===2?(chosen.category==='PISTOL'?chosen:WEAPONS.classic):chosen;
    if(next.id!==this.state?.self.activeWeapon)this.recoilPresenter.resetWeapon(performance.now());
    if(next.id===this.state?.self.activeWeapon)return;
    this.input.aim=false;this.input.altFire=false;this.input.zoomLevel=1;this.bufferedAltAt=0;this.localEquipUntil=performance.now()+next.equip*1000;this.send({type:'switch',slot});
  }
  emitInput=(predict=false,record=predict)=>{
    this.input.seq++;const suspended=this.state?.self.motionStale;
    const input={...this.input,active:this.locked,fire:this.locked&&!suspended&&this.input.fire,altFire:this.locked&&!suspended&&this.input.altFire,firePress:suspended?0:this.input.firePress,altPress:suspended?0:this.input.altPress};
    if(predict&&this.localBody&&this.state){this.previousBody={...this.localBody};moveBody(this.localBody,input,1/RULES.tickRate,weaponFor(this.state.self.activeWeapon));}
    if(record){this.pending.push({input});if(this.pending.length>128)this.pending.shift();}
    this.send({type:'input',...input});
  };
  predictShot(time:number,alternate=false){
    const state=this.state;if(!this.locked||state?.duel?.phase!=='live'||state.self.motionStale||!state.self.body||state.self.body.health<=0)return;
    const weapon=weaponFor(state.self.activeWeapon),serverNow=state.now+time-this.receivedAt;
    this.predictedShots=this.predictedShots.filter(s=>time-s.at<350);
    if(serverNow<state.self.reloadAt||serverNow<state.self.equipUntil||time<this.localEquipUntil)return;
    const next=this.localNextShot.get(weapon.id)??0;
    if(time<next){if(alternate&&weapon.burst&&next-time<=225)this.bufferedAltAt=next;return;}
    if(!weapon.melee&&state.self.ammo-this.predictedShots.filter(s=>s.weapon===weapon.id).length<=0)return;
    this.localNextShot.set(weapon.id,shotDeadline(next,time,fireProfile(weapon,this.input,alternate).rate,this.frameDuration+1));this.bufferedAltAt=0;const recoilId=weapon.id==='vandal'?this.recoilPresenter.predictShot({at:time,aim:this.input.aim,crouch:this.localBody?.crouch??false,running:Math.hypot(this.localBody?.vx??0,this.localBody?.vz??0)>weapon.runSpeed*RULES.walkSpeed+.001&&!this.localBody?.walk}):undefined;this.predictedShots.push({weapon:weapon.id,at:time,recoilId});this.shotAt=time;this.audio.shot(weapon.id,true);
    if(weapon.melee&&this.localBody){const b=this.previousBody?blendPose(this.previousBody,this.localBody,this.input.ownAlpha):this.localBody;if(meleeStrike([b.x,b.y+(b.crouch?RULES.crouchEye:RULES.eye),b.z],this.input.yaw,this.input.pitch,null,alternate)?.wall)this.audio.impact();}
  }
  setState(state:State){
    const oldHealth=this.state?.self.body?.health??100;if((state.self.body?.health??100)<oldHealth)this.damageAt=performance.now();
    const weaponChanged=this.state?.self.activeWeapon!==state.self.activeWeapon;this.state=state;this.receivedAt=performance.now();if(weaponChanged)this.recoilPresenter.resetWeapon(this.receivedAt);
    if(state.duel&&state.self.body){
      const key=`${state.duel.id}/${state.duel.round}`;
      const resync=this.input.epoch!==state.self.motionEpoch||state.self.motionStale;
      if(resync){this.pending=[];this.accumulator=0;this.input.seq=Math.max(this.input.seq,state.self.body.seq);this.input.fire=false;this.input.altFire=false;this.input.firePress=0;this.input.altPress=0;this.predictedShots=[];this.bufferedAltAt=0;this.weaponView.reset();this.recoilPresenter.reset(`${key}/${state.self.motionEpoch}`);resetGait(this.ownGait,state.self.body);resetGait(this.enemyGait,state.duel.opponent?.body);}
      this.input.epoch=state.self.motionEpoch;
      if(this.roundKey!==key){while(this.impacts.length)this.removeImpact(0);for(const t of this.tracers){this.scene.remove(t.mesh);t.mesh.geometry.dispose();(t.mesh.material as THREE.Material).dispose();}this.tracers=[];this.roundKey=key;this.localBody={...state.self.body};this.previousBody={...state.self.body};this.opponentSamples=[];this.input.yaw=state.self.body.yaw;this.input.pitch=0;this.input.fire=false;this.input.altFire=false;this.input.aim=false;this.input.zoomLevel=1;this.input.firePress=0;this.input.altPress=0;this.pending=[];this.accumulator=0;this.seen.clear();this.seenVolleys.clear();this.predictedShots=[];this.localNextShot.clear();this.localEquipUntil=0;this.bufferedAltAt=0;this.shotAt=0;this.weaponView.reset();this.recoilPresenter.reset(`${key}/${state.self.motionEpoch}`);resetGait(this.ownGait,state.self.body);resetGait(this.enemyGait,state.duel.opponent?.body);this.lastLook={yaw:this.input.yaw,pitch:this.input.pitch};}
      else if(this.localBody){
        const prediction=reconcileBody(state.self.body,state.duel.phase==='live'&&!state.self.motionStale?this.pending:[],weaponFor(state.self.activeWeapon),state.self.previousBody??state.self.body);
        this.previousBody=prediction.previousBody;this.localBody=prediction.body;this.pending=prediction.pending;
      }
      if(state.duel.opponent?.body)rememberPose(this.opponentSamples,state.now,state.duel.opponent.body,state.duel.opponent.poseId);
      this.recoilPresenter.sync({epoch:`${key}/${state.self.motionEpoch}`,serial:state.self.shotSerial,at:state.now,lastShot:state.self.lastShot,shotCount:state.self.shotCount,recoilPitch:state.self.recoilPitch,recoilYaw:state.self.recoilYaw},this.receivedAt);
      for(const event of state.duel.events)if(!this.seen.has(event.id)){this.seen.add(event.id);this.shot(event);}
      if(this.seen.size>300){const keep=[...this.seen].slice(-100);this.seen=new Set(keep);}
    }
    if(['training','finished','lobby'].includes(state.party.phase))this.unlock();
  }
  shot(event:Shot){
    const own=event.shooterId===this.state?.self.id,weapon=weaponFor(event.weapon),first=!this.seenVolleys.has(event.volleyId);this.seenVolleys.add(event.volleyId);
    if(!weapon.melee&&(own||!['ghost','spectre','phantom'].includes(weapon.id))){
    const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...event.origin as [number,number,number]),new THREE.Vector3(...event.end as [number,number,number])]);
    const tracer=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:own?'#fff0b4':'#ffbf7b',transparent:true,opacity:.8}));this.scene.add(tracer);this.tracers.push({mesh:tracer,at:performance.now()});
    }
    if(own&&event.targetId){this.hitAt=performance.now();this.onHit(event.zone===0);this.audio.hit(event.zone===0,event.killed===true);if(event.killed)this.onKill(event.zone===0);}
    this.impact(event);
    if(first){
      const receipt=own&&weapon.id==='vandal'?this.recoilPresenter.acknowledge({epoch:`${this.roundKey}/${this.state!.self.motionEpoch}`,serial:event.shotSerial},performance.now()):null;
      const predicted=own?this.predictedShots.findIndex(s=>s.weapon===weapon.id&&(weapon.id==='vandal'?s.recoilId===receipt?.predictionId:performance.now()-s.at<350)):-1;
      if(predicted>=0)this.predictedShots.splice(predicted,1);
      else if(!receipt?.predicted){if(own)this.shotAt=performance.now();const b=this.localBody;this.audio.shot(event.weapon,own,b?Math.hypot(event.origin[0]-b.x,event.origin[2]-b.z):0,b?((event.origin[0]-b.x)*Math.cos(this.input.yaw)-(event.origin[2]-b.z)*Math.sin(this.input.yaw))/10:0);}
    }
    if(this.seenVolleys.size>300)this.seenVolleys=new Set([...this.seenVolleys].slice(-100));
  }
  impact(event:Shot){
    const at=new THREE.Vector3(...event.end as [number,number,number]),group=new THREE.Group();
    const normal=new THREE.Vector3().fromArray(event.origin).sub(at).normalize();
    if(event.targetId){
      const color=event.zone===0?'#ffe0ab':'#c78671';
      const spark=new THREE.Mesh(new THREE.RingGeometry(.018,event.zone===0?.09:.055,6),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.9,depthWrite:false}));group.add(spark);
    }else{
      if(at.distanceTo(new THREE.Vector3().fromArray(event.origin))>=119)return;
      let nearest=Math.abs(at.y),face=new THREE.Vector3(0,1,0);
      for(const block of MAP.blocks){if(at.x<block.x-block.w/2-.04||at.x>block.x+block.w/2+.04||at.z<block.z-block.d/2-.04||at.z>block.z+block.d/2+.04||at.y<-.04||at.y>block.h+.04)continue;for(const [axis,sign,edge] of [[0,-1,block.x-block.w/2],[0,1,block.x+block.w/2],[1,1,block.h],[2,-1,block.z-block.d/2],[2,1,block.z+block.d/2]] as number[][]){
        const d=Math.abs(at.getComponent(axis)-edge);if(d<nearest){nearest=d;face=new THREE.Vector3();face.setComponent(axis,sign);}
      }}
      normal.copy(face);group.add(new THREE.Mesh(new THREE.CircleGeometry(.026,7),new THREE.MeshBasicMaterial({color:'#273138',side:THREE.DoubleSide,transparent:true,opacity:.82,polygonOffset:true,polygonOffsetFactor:-2,depthWrite:false})));
      group.add(new THREE.Mesh(new THREE.RingGeometry(.027,.046,7),new THREE.MeshBasicMaterial({color:'#8f8b7a',side:THREE.DoubleSide,transparent:true,opacity:.6,depthWrite:false})));
    }
    group.position.copy(at).addScaledVector(normal,.006);group.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);this.scene.add(group);this.impacts.push({mesh:group,at:performance.now(),life:event.targetId?180:16000});
    if(this.impacts.length>100)this.removeImpact(0);
  }
  removeImpact(index:number){const item=this.impacts[index];this.scene.remove(item.mesh);item.mesh.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});this.impacts.splice(index,1);}
  buildHands(id:string){
    this.hands.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.dispose();});this.hands.clear();if(id==='vandal'){this.currentWeapon=id;this.flash=null;return;}this.gun=weaponModel(id);this.hands.add(this.gun);
    const sleeve=mat('#395e66'),glove=mat('#172c35');
    box(this.hands,[.12,.13,.36],[.07,-.12,.19],sleeve).rotation.x=-.25;box(this.hands,[.11,.12,.12],[.025,-.08,.035],glove);
    if(!['classic','ghost','sheriff','knife'].includes(id)){box(this.hands,[.13,.13,.4],[-.17,-.14,-.27],sleeve).rotation.y=-.55;box(this.hands,[.11,.12,.16],[-.06,-.1,-.43],glove);}
    this.currentWeapon=id;
    this.flash=null;if(id!=='knife'){this.flash=new THREE.Mesh(new THREE.ConeGeometry(.065,.18,5),new THREE.MeshBasicMaterial({color:'#ffdc82',transparent:true,opacity:.9}));this.flash.rotation.x=-Math.PI/2;this.flash.position.set(0,.055,['classic','ghost','sheriff'].includes(id)?-.61:id==='operator'?-1.45:-1.04);this.flash.visible=false;this.gun.add(this.flash);}
  }
  render=(time:number)=>{
    if(this.disposed)return;this.frame=requestAnimationFrame(this.render);const dt=Math.min((time-this.lastFrame)/1000||.016,.25);this.lastFrame=time;this.frameDuration=dt*1000;
    const state=this.state,inArena=!!(state?.party.phase==='matches'&&state.duel&&state.self.body),body=this.localBody;
    this.trainingRange.group.visible=inArena&&state?.party.demoMode==='vandal';this.trainingRange.setMode(state?.party.demoDrill??'target');for(const part of this.rangeOccluders)part.visible=!(inArena&&state?.party.demoMode==='vandal'&&state.party.demoDrill==='wall');
    if(inArena&&body&&state?.duel){
      const live=state.duel.phase==='live'&&state.self.body!.health>0;
      Object.assign(this.input,this.keyboard.read());
      if(live&&this.locked){this.accumulator=Math.min(this.accumulator+dt,.25);while(this.accumulator>=1/RULES.tickRate){this.emitInput(!state.self.motionStale,true);this.accumulator-=1/RULES.tickRate;}}else this.accumulator=0;
      const rendered=!state.self.motionStale&&this.previousBody?blendPose(this.previousBody,body,this.accumulator*RULES.tickRate):body;
      this.camera.position.set(rendered.x,rendered.y+stanceDimensions(rendered.crouch,RULES).eye,rendered.z);
      this.input.ownSeq=body.seq;this.input.ownAlpha=this.accumulator*RULES.tickRate;
      const presentation=presentPose(this.opponentSamples,state.now+time-this.receivedAt-PRESENTATION.delay);
      this.viewTime=presentation?.time??state.now;this.input.viewTime=this.viewTime;this.input.viewFromId=presentation?.fromId??0;this.input.viewToId=presentation?.toId??0;
      const weapon=weaponFor(state.self.activeWeapon),ads=this.input.aim&&this.locked&&weapon.zoom>1;
      if(weapon.auto&&this.input.fire)this.predictShot(time);
      if(this.bufferedAltAt&&time>=this.bufferedAltAt)this.predictShot(time,true);
      const visualRecoil=ads?1:.35,recoil=weapon.id==='vandal'?this.recoilPresenter.sample({now:time,ads}):{pitch:state.self.recoilPitch,yaw:state.self.recoilYaw,cameraPitch:state.self.recoilPitch*visualRecoil,cameraYaw:state.self.recoilYaw*visualRecoil};
      this.camera.rotation.set(this.input.pitch+recoil.cameraPitch,this.input.yaw+recoil.cameraYaw,0,'YXZ');
      this.camera.fov=verticalFov(this.camera.aspect,ads?effectiveZoom(weapon,this.input):1);this.camera.updateProjectionMatrix();
      if(this.currentWeapon!==weapon.id)this.buildHands(weapon.id);
      const speed=Math.hypot(body.vx,body.vz),gait=advanceGait(this.ownGait,rendered,weapon,{active:live,walk:this.input.walk,crouch:this.input.crouch,walkSpeed:RULES.walkSpeed});
      const bob=this.reducedMotion?0:Math.cos(gait.phase*2)*Math.min(speed,4)*.0015;
      const kick=Math.max(0,1-(time-this.shotAt)/120),serverNow=state.now+time-this.receivedAt,reload=state.self.reloadAt>serverNow;
      if(this.flash)this.flash.visible=time-this.shotAt<45;
      this.hands.position.set(ads?0:.31,(ads?(weapon.id==='guardian'?-.21:-.17):-.29)+bob-(reload?.16:0),-.54+kick*.045);this.hands.rotation.set(kick*(weapon.melee?.3:.07)+(reload?-.35:0),0,weapon.melee?kick*.65:ads?0:-.025);
      this.hands.visible=weapon.id!=='vandal'&&state.self.body!.health>0&&!(ads&&weapon.id==='operator');
      const mechanical=this.weaponView.update({time,dt,weaponId:weapon.id,ads,fireHeld:this.input.fire,shotAt:this.shotAt,recoilPitch:recoil.pitch,recoilYaw:recoil.yaw,reloadRemaining:Math.max(0,state.self.reloadAt-serverNow),reloadDuration:weapon.reload,equipRemaining:Math.max(0,state.self.equipUntil-serverNow,this.localEquipUntil-time),equipDuration:weapon.equip,speed,strafe:this.input.strafe,grounded:body.grounded,crouch:body.crouch,reducedMotion:this.reducedMotion,visible:state.self.body!.health>0,stride:gait.phase,lookYawDelta:Math.atan2(Math.sin(this.input.yaw-this.lastLook.yaw),Math.cos(this.input.yaw-this.lastLook.yaw)),lookPitchDelta:this.input.pitch-this.lastLook.pitch});
      this.lastLook={yaw:this.input.yaw,pitch:this.input.pitch};if(weapon.id==='vandal'&&!this.audio.muted&&this.audio.context)for(const event of mechanical)playVandalMechanical(this.audio.context,event,.09,this.audio.bus??this.audio.context.destination);
      if(gait.step)this.audio.step(true);
      const enemy=presentation?.body??state.duel.opponent?.body;this.avatar.group.visible=!!enemy&&!(state.party.demoMode==='vandal'&&state.party.demoDrill==='wall');
      if(enemy){const enemyWeapon=weaponFor(state.duel.opponent?.weapon??'classic'),enemyGait=advanceGait(this.enemyGait,enemy,enemyWeapon,{active:live,walkSpeed:RULES.walkSpeed}),a=this.avatar.group;this.avatar.update(enemy,{phase:enemyGait.phase});a.rotation.z=enemy.health<=0?1.45:0;if(enemyGait.step){const dx=enemy.x-body.x,dz=enemy.z-body.z;this.audio.step(false,Math.hypot(dx,dz),(dx*Math.cos(this.input.yaw)-dz*Math.sin(this.input.yaw))/10);}}
    }else{
      const t=this.reducedMotion?0:time*.000015;this.camera.position.set(23+Math.sin(t)*2,15,25+Math.cos(t)*2);this.camera.lookAt(0,1,0);this.camera.fov=58;this.camera.updateProjectionMatrix();this.hands.visible=false;this.weaponView.group.visible=false;this.avatar.group.visible=false;
    }
    for(let i=this.tracers.length-1;i>=0;i--){const t=this.tracers[i],age=time-t.at;if(age>110){this.scene.remove(t.mesh);t.mesh.geometry.dispose();(t.mesh.material as THREE.Material).dispose();this.tracers.splice(i,1);}else(t.mesh.material as THREE.LineBasicMaterial).opacity=.75*(1-age/110);}
    for(let i=this.impacts.length-1;i>=0;i--)if(time-this.impacts[i].at>this.impacts[i].life)this.removeImpact(i);
    this.renderer.autoClear=true;this.renderer.render(this.scene,this.camera);
    if(inArena&&(this.hands.visible||this.weaponView.group.visible)){this.renderer.autoClear=false;this.renderer.clearDepth();this.renderer.render(this.handsScene,this.handsCamera);}
  };
  startRecording(options:ArenaRecorderOptions){this.audio.unlock();this.recorder??=createArenaRecorder(this.renderer.domElement,{...options,audioStream:this.audio.recordingDestination?.stream});return this.recorder.start();}
  stopRecording(){this.recorder?.stop();}
  dispose(){this.recorder?.dispose();this.disposed=true;cancelAnimationFrame(this.frame);this.unlock();this.trainingRange.dispose();this.avatar.dispose();{const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();this.avatarWeapon.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}this.weaponView.dispose();while(this.impacts.length)this.removeImpact(0);window.removeEventListener('resize',this.resize);document.removeEventListener('pointerlockchange',this.lockChange);document.removeEventListener('mousemove',this.mouseMove);document.removeEventListener('mousedown',this.mouseDown);document.removeEventListener('mouseup',this.mouseUp);document.removeEventListener('keydown',this.keyDown);document.removeEventListener('keyup',this.keyUp);window.removeEventListener('blur',this.blur);document.removeEventListener('visibilitychange',this.visibility);document.removeEventListener('contextmenu',this.contextMenu);this.renderer.dispose();this.renderer.domElement.remove();void this.audio.context?.close();}
}
